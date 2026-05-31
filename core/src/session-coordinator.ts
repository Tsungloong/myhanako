import type {
  AppendSessionEventInput,
  SessionEventType
} from "../../shared/src/session-events.ts"
import { RuntimeStreamMirror } from "./session-stream-mirror.ts"

export type SessionManagerLike = {
  readonly getSessionFile?: () => string | null
}

export type SessionManagers = {
  readonly create: (cwd: string, sessionDir: string) => SessionManagerLike | Promise<SessionManagerLike>
  readonly open?: (
    sessionFile: string,
    cwd?: string,
    sessionDir?: string
  ) => SessionManagerLike | Promise<SessionManagerLike>
}

export type AgentSessionLike = {
  readonly sessionManager?: SessionManagerLike
  readonly subscribe?: (listener: (event: RuntimeStreamEvent) => void) => (() => void) | { readonly unsubscribe?: () => void }
  readonly sendUserMessage?: (content: string, options?: { readonly deliverAs?: "steer" | "followUp" }) => void | Promise<void>
  readonly sendCustomMessage?: (message: unknown, options?: Record<string, unknown>) => void | Promise<void>
  readonly send?: (message: string, options?: Record<string, unknown>) => void | Promise<void>
  readonly isStreaming?: boolean
  readonly dispose?: () => void | Promise<void>
  readonly abort?: () => void | Promise<void>
}

export type CreateAgentSession = (options: Record<string, unknown>) => Promise<{ readonly session: AgentSessionLike }>

export type RuntimeStreamEvent = {
  readonly type?: string
  readonly [key: string]: unknown
}

export type SessionCoordinatorRuntime = {
  readonly authStorage: unknown
  readonly modelRegistry: unknown
  readonly resourceLoader: unknown
  readonly settingsManager?: unknown
  readonly tools?: readonly unknown[]
  readonly customTools?: readonly unknown[]
}

export type SessionCoordinatorRuntimeProvider =
  | SessionCoordinatorRuntime
  | (() => SessionCoordinatorRuntime | Promise<SessionCoordinatorRuntime>)

export type SessionCoordinatorEvent = RuntimeStreamEvent & {
  readonly sessionId?: string
}

export type SessionCoordinatorEventLog = {
  readonly append: (event: AppendSessionEventInput<SessionEventType>) => unknown | Promise<unknown>
}

export type SessionCoordinatorOptions = {
  readonly createAgentSession?: CreateAgentSession
  readonly sessionManagers: SessionManagers
  readonly runtime: SessionCoordinatorRuntimeProvider
  readonly eventSink?: (event: SessionCoordinatorEvent) => unknown | Promise<unknown>
  readonly eventLog?: SessionCoordinatorEventLog
}

export type CreateSessionOptions = {
  readonly cwd: string
  readonly sessionDir: string
  readonly model: unknown
  readonly thinkingLevel?: string
}

export type SendSessionMessageOptions = {
  readonly sessionId?: string
  readonly message: string
  readonly messageId?: string
  readonly triggerTurn?: boolean
}

export type InterruptSessionOptions = {
  readonly sessionId?: string
  readonly requestId?: string
  readonly reason?: string
}

export type RecoverSessionOptions = {
  readonly cwd: string
  readonly sessionFile: string
  readonly sessionDir?: string
  readonly model?: unknown
  readonly thinkingLevel?: string
}

export type SessionCoordinatorState = {
  readonly session: AgentSessionLike
  readonly sessionManager: SessionManagerLike
  readonly sessionId: string
}

type ActiveSessionState = SessionCoordinatorState & {
  readonly unsubscribe?: () => void
}

export class SessionCoordinator {
  readonly #createAgentSession: CreateAgentSession
  readonly #sessionManagers: SessionManagers
  readonly #runtime: SessionCoordinatorRuntimeProvider
  readonly #eventSink?: (event: SessionCoordinatorEvent) => unknown | Promise<unknown>
  readonly #eventLog?: SessionCoordinatorEventLog
  readonly #streamMirror?: RuntimeStreamMirror
  #activeSession?: ActiveSessionState

  constructor(options: SessionCoordinatorOptions) {
    this.#createAgentSession = options.createAgentSession ?? defaultCreateAgentSession
    this.#sessionManagers = options.sessionManagers
    this.#runtime = options.runtime
    this.#eventSink = options.eventSink
    this.#eventLog = options.eventLog
    this.#streamMirror = options.eventLog
      ? new RuntimeStreamMirror({ eventLog: options.eventLog })
      : undefined
  }

  get currentSession(): AgentSessionLike | undefined {
    return this.#activeSession?.session
  }

  get currentSessionId(): string | undefined {
    return this.#activeSession?.sessionId
  }

  async createSession(options: CreateSessionOptions): Promise<SessionCoordinatorState> {
    const sessionManager = await this.#sessionManagers.create(options.cwd, options.sessionDir)
    const state = await this.#createRuntimeSession({
      cwd: options.cwd,
      sessionManager,
      model: options.model,
      thinkingLevel: options.thinkingLevel
    })

    await this.#emitLifecycle("session_created", state.sessionId, {
      cwd: options.cwd,
      sessionFile: state.sessionId
    })
    return state
  }

  async recoverSession(options: RecoverSessionOptions): Promise<SessionCoordinatorState> {
    const sessionManager = options.sessionDir
      ? await this.#openSessionManager(options.sessionFile, options.cwd, options.sessionDir)
      : await this.#openSessionManager(options.sessionFile, options.cwd)
    const state = await this.#createRuntimeSession({
      cwd: options.cwd,
      sessionManager,
      thinkingLevel: options.thinkingLevel
    })

    await this.#emitLifecycle("session_recovered", state.sessionId, {
      recoveredEventCount: 0,
      sessionFile: state.sessionId
    })
    return state
  }

  async disposeCurrentSession(reason = "dispose"): Promise<void> {
    const active = this.#activeSession
    if (!active) {
      return
    }

    await this.#releaseActiveSession(active, reason)
  }

  async #releaseActiveSession(active: ActiveSessionState, reason: string): Promise<void> {
    active.unsubscribe?.()
    await active.session.dispose?.()
    if (this.#activeSession === active) {
      this.#activeSession = undefined
    }
    await this.#emitLifecycle("session_disposed", active.sessionId, {
      sessionFile: active.sessionId,
      reason
    })
  }

  async sendMessage(options: SendSessionMessageOptions): Promise<{ readonly ok: true; readonly mode: string }> {
    const active = this.#requireActiveSession(options.sessionId)
    if (typeof options.message !== "string" || options.message.length === 0) {
      throw new Error("SessionCoordinator.sendMessage requires a non-empty message")
    }

    const messageId = options.messageId ?? `user_${Date.now()}`
    await this.#eventLog?.append({
      sessionId: active.sessionId,
      type: "user_message_created",
      actor: "user",
      payload: {
        messageId,
        content: options.message
      }
    } as AppendSessionEventInput<SessionEventType>)

    if (typeof active.session.sendUserMessage === "function") {
      await active.session.sendUserMessage(options.message, {
        ...(active.session.isStreaming ? { deliverAs: "followUp" as const } : {})
      })
      return { ok: true, mode: active.session.isStreaming ? "followUp" : "triggerTurn" }
    }
    if (typeof active.session.sendCustomMessage === "function") {
      await active.session.sendCustomMessage({
        customType: "myhanako:user_message",
        content: options.message,
        display: options.message,
        details: {
          messageId
        }
      }, {
        triggerTurn: options.triggerTurn ?? true,
        ...(active.session.isStreaming ? { deliverAs: "followUp" } : {})
      })
      return { ok: true, mode: active.session.isStreaming ? "followUp" : options.triggerTurn === false ? "notifyOnly" : "triggerTurn" }
    }
    if (typeof active.session.send === "function") {
      await active.session.send(options.message, {
        triggerTurn: options.triggerTurn ?? true
      })
      return { ok: true, mode: "send" }
    }

    throw new Error("Active session does not support sending messages")
  }

  async interruptCurrentSession(options: InterruptSessionOptions = {}): Promise<{ readonly ok: boolean }> {
    const active = this.#requireActiveSession(options.sessionId)
    await active.session.abort?.()
    await this.#eventLog?.append({
      sessionId: active.sessionId,
      type: "assistant_interrupted",
      actor: "user",
      payload: {
        requestId: options.requestId ?? `interrupt_${Date.now()}`,
        reason: options.reason ?? "user_interrupt"
      }
    } as AppendSessionEventInput<SessionEventType>)
    await this.#eventSink?.({
      type: "assistant_interrupted",
      sessionId: active.sessionId,
      payload: {
        reason: options.reason ?? "user_interrupt"
      }
    })
    return { ok: true }
  }

  async #openSessionManager(sessionFile: string, cwd?: string, sessionDir?: string): Promise<SessionManagerLike> {
    if (this.#sessionManagers.open) {
      return this.#sessionManagers.open(sessionFile, cwd, sessionDir)
    }

    if (!sessionDir) {
      throw new Error("SessionCoordinator.recoverSession requires sessionManagers.open or sessionDir")
    }
    return this.#sessionManagers.create(cwd ?? "", sessionDir)
  }

  #requireActiveSession(sessionId?: string): ActiveSessionState {
    const active = this.#activeSession
    if (!active) {
      throw new Error("No active session")
    }
    assertSessionIdMatches(active.sessionId, sessionId)
    return active
  }

  async #createRuntimeSession(options: {
    readonly cwd: string
    readonly sessionManager: SessionManagerLike
    readonly model?: unknown
    readonly thinkingLevel?: string
  }): Promise<SessionCoordinatorState> {
    const runtime = await this.#resolveRuntime()
    const sessionOptions: Record<string, unknown> = {
      cwd: options.cwd,
      sessionManager: options.sessionManager,
      authStorage: runtime.authStorage,
      modelRegistry: runtime.modelRegistry,
      resourceLoader: runtime.resourceLoader
    }
    if (runtime.settingsManager !== undefined) {
      sessionOptions.settingsManager = runtime.settingsManager
    }
    if (runtime.tools !== undefined) {
      sessionOptions.tools = runtime.tools
    }
    if (runtime.customTools !== undefined) {
      sessionOptions.customTools = runtime.customTools
    }
    if (options.model !== undefined) {
      sessionOptions.model = options.model
    }
    if (options.thinkingLevel !== undefined) {
      sessionOptions.thinkingLevel = options.thinkingLevel
    }

    const { session } = await this.#createAgentSession(sessionOptions)
    const sessionId = getSessionId(session, options.sessionManager)
    const unsubscribe = normalizeUnsubscribe(session.subscribe?.((event) => {
      void this.#forwardStreamEvent(event, sessionId)
    }))
    const state = {
      session,
      sessionManager: options.sessionManager,
      sessionId,
      unsubscribe
    }
    const previous = this.#activeSession
    if (previous) {
      await this.#releaseActiveSession(previous, "replace")
    }
    this.#activeSession = state
    return state
  }

  async #resolveRuntime(): Promise<SessionCoordinatorRuntime> {
    return typeof this.#runtime === "function"
      ? this.#runtime()
      : this.#runtime
  }

  async #forwardStreamEvent(event: RuntimeStreamEvent, sessionId: string): Promise<void> {
    await this.#eventSink?.({
      ...event,
      sessionId
    })
    await this.#streamMirror?.mirror(sessionId, event)
  }

  async #emitLifecycle(
    type: "session_created" | "session_recovered" | "session_disposed",
    sessionId: string,
    payload: Record<string, unknown>
  ): Promise<void> {
    await this.#eventSink?.({
      type,
      sessionId,
      payload
    })
    await this.#eventLog?.append({
      sessionId,
      type,
      actor: "system",
      payload
    } as AppendSessionEventInput<SessionEventType>)
  }
}

function assertSessionIdMatches(expected: string, actual?: string): void {
  if (actual !== undefined && actual !== expected) {
    throw new Error(`Active session mismatch: expected ${expected}, received ${actual}`)
  }
}

async function defaultCreateAgentSession(options: Record<string, unknown>): Promise<{ readonly session: AgentSessionLike }> {
  const piSdk = await import("../../lib/pi-sdk/index.ts")
  return piSdk.createAgentSession(options) as Promise<{ readonly session: AgentSessionLike }>
}

function getSessionId(session: AgentSessionLike, fallbackSessionManager: SessionManagerLike): string {
  return session.sessionManager?.getSessionFile?.()
    ?? fallbackSessionManager.getSessionFile?.()
    ?? "unknown-session"
}

function normalizeUnsubscribe(raw: ReturnType<NonNullable<AgentSessionLike["subscribe"]>> | undefined): (() => void) | undefined {
  if (typeof raw === "function") {
    return raw
  }
  if (typeof raw?.unsubscribe === "function") {
    return () => raw.unsubscribe?.()
  }
  return undefined
}
