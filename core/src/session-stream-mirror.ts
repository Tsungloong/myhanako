import type {
  AppendSessionEventInput,
  JsonObject,
  JsonValue,
  SessionEventType
} from "../../shared/src/session-events.ts"

export type RuntimeStreamEventLike = {
  readonly type?: string
  readonly [key: string]: unknown
}

export type RuntimeStreamMirrorEventLog = {
  readonly append: (event: AppendSessionEventInput<SessionEventType>) => unknown | Promise<unknown>
}

export type RuntimeStreamMirrorOptions = {
  readonly eventLog: RuntimeStreamMirrorEventLog
  readonly requestIdFactory?: (sessionId: string, turnSequence?: number) => string
  readonly messageIdFactory?: (sessionId: string, turnSequence?: number) => string
  readonly toolCallIdFactory?: (sessionId: string, event: RuntimeStreamEventLike) => string
}

type AssistantTurnState = {
  readonly requestId: string
  readonly messageId: string
  readonly model: string
  deltaSequence: number
  content: string
}

type ToolCallState = {
  readonly toolCallId: string
  readonly toolName: string
}

export class RuntimeStreamMirror {
  readonly #eventLog: RuntimeStreamMirrorEventLog
  readonly #requestIdFactory: (sessionId: string, turnSequence?: number) => string
  readonly #messageIdFactory: (sessionId: string, turnSequence?: number) => string
  readonly #toolCallIdFactory: (sessionId: string, event: RuntimeStreamEventLike) => string
  readonly #turns = new Map<string, AssistantTurnState>()
  readonly #toolCalls = new Map<string, Map<string, ToolCallState>>()
  readonly #queues = new Map<string, Promise<unknown>>()
  readonly #turnSequences = new Map<string, number>()

  constructor(options: RuntimeStreamMirrorOptions) {
    this.#eventLog = options.eventLog
    this.#requestIdFactory = options.requestIdFactory ?? ((sessionId, turnSequence) => `req_${stableId(sessionId)}_${turnSequence ?? 1}`)
    this.#messageIdFactory = options.messageIdFactory ?? ((sessionId, turnSequence) => `assistant_${stableId(sessionId)}_${turnSequence ?? 1}`)
    this.#toolCallIdFactory =
      options.toolCallIdFactory ?? ((sessionId) => `tool_${stableId(sessionId)}_${Date.now()}`)
  }

  async mirror(sessionId: string, event: RuntimeStreamEventLike): Promise<void> {
    const previous = this.#queues.get(sessionId) ?? Promise.resolve()
    const next = previous.then(() => this.#mirrorUnlocked(sessionId, event))
    this.#queues.set(sessionId, next.catch(() => undefined))
    await next
  }

  async #mirrorUnlocked(sessionId: string, event: RuntimeStreamEventLike): Promise<void> {
    switch (event.type) {
      case "session_status": {
        if (event.isStreaming === true) {
          await this.#ensureTurn(sessionId, event)
        } else if (event.isStreaming === false) {
          await this.#completeTurn(sessionId, "stop")
        }
        return
      }
      case "message_update": {
        await this.#mirrorMessageUpdate(sessionId, event)
        return
      }
      case "message_end": {
        const message = asRecord(event.message)
        const finishReason = stringOrUndefined(message?.stopReason) ?? stringOrUndefined(event.stopReason)
        await this.#completeTurn(sessionId, finishReason)
        return
      }
      case "turn_end": {
        await this.#completeTurn(sessionId, stringOrUndefined(event.stopReason) ?? "stop")
        return
      }
      case "tool_execution_start": {
        await this.#mirrorToolStart(sessionId, event)
        return
      }
      case "tool_execution_end": {
        await this.#mirrorToolEnd(sessionId, event)
        return
      }
      case "session_user_message": {
        await this.#mirrorSessionUserMessage(sessionId, event)
        return
      }
    }
  }

  async #mirrorMessageUpdate(sessionId: string, event: RuntimeStreamEventLike): Promise<void> {
    const assistantEvent = asRecord(event.assistantMessageEvent)
    if (!assistantEvent) {
      return
    }

    if (assistantEvent.type === "text_delta") {
      const turn = await this.#ensureTurn(sessionId, event)
      const delta = stringOrUndefined(assistantEvent.delta) ?? ""
      turn.deltaSequence += 1
      turn.content += delta
      await this.#append({
        sessionId,
        type: "assistant_delta_received",
        actor: "assistant",
        payload: {
          requestId: turn.requestId,
          messageId: turn.messageId,
          delta,
          sequence: turn.deltaSequence
        }
      })
      return
    }

    if (assistantEvent.type === "toolcall_start") {
      const turn = await this.#ensureTurn(sessionId, event)
      await this.#append({
        sessionId,
        type: "tool_call_requested",
        actor: "assistant",
        payload: {
          requestId: turn.requestId,
          toolCallId: this.#toolCallIdFor(sessionId, event),
          toolName: stringOrUndefined(assistantEvent.toolName) ?? "unknown",
          arguments: toJsonObject(assistantEvent.args)
        }
      })
    }
  }

  async #mirrorToolStart(sessionId: string, event: RuntimeStreamEventLike): Promise<void> {
    const turn = await this.#ensureTurn(sessionId, event)
    const toolCallId = this.#toolCallIdFor(sessionId, event)
    const toolName = stringOrUndefined(event.toolName) ?? "unknown"
    this.#setToolState(sessionId, { toolCallId, toolName })

    await this.#append({
      sessionId,
      type: "tool_call_requested",
      actor: "assistant",
      payload: {
        requestId: turn.requestId,
        toolCallId,
        toolName,
        arguments: toJsonObject(event.args)
      }
    })
    await this.#append({
      sessionId,
      type: "tool_call_started",
      actor: "tool",
      payload: {
        toolCallId,
        toolName
      }
    })
  }

  async #mirrorToolEnd(sessionId: string, event: RuntimeStreamEventLike): Promise<void> {
    const toolName = stringOrUndefined(event.toolName) ?? "unknown"
    const state = this.#getToolState(sessionId, toolName) ?? {
      toolCallId: this.#toolCallIdFor(sessionId, event),
      toolName
    }
    const result = asRecord(event.result)

    if (event.isError === true) {
      await this.#append({
        sessionId,
        type: "tool_call_failed",
        actor: "tool",
        payload: {
          toolCallId: state.toolCallId,
          errorCode: stringOrUndefined(result?.errorCode) ?? "tool_error",
          message: stringOrUndefined(result?.message) ?? stringOrUndefined(event.error) ?? "Tool execution failed"
        }
      })
      return
    }

    await this.#append({
      sessionId,
      type: "tool_call_completed",
      actor: "tool",
      payload: {
        toolCallId: state.toolCallId,
        result: toJsonValue(result?.details ?? result ?? null)
      }
    })
  }

  async #mirrorSessionUserMessage(sessionId: string, event: RuntimeStreamEventLike): Promise<void> {
    const message = asRecord(event.message)
    const content = stringOrUndefined(message?.text) ?? stringOrUndefined(event.text)
    if (content === undefined) {
      return
    }

    await this.#append({
      sessionId,
      type: "user_message_created",
      actor: "user",
      payload: {
        messageId: stringOrUndefined(message?.messageId) ?? `user_${stableId(sessionId)}_${Date.now()}`,
        content
      }
    })
  }

  async #ensureTurn(sessionId: string, event: RuntimeStreamEventLike): Promise<AssistantTurnState> {
    const existing = this.#turns.get(sessionId)
    if (existing) {
      return existing
    }

    const turnSequence = this.#nextTurnSequence(sessionId)
    const state = {
      requestId: stringOrUndefined(event.requestId) ?? this.#requestIdFactory(sessionId, turnSequence),
      messageId: stringOrUndefined(event.messageId) ?? this.#messageIdFactory(sessionId, turnSequence),
      model: stringOrUndefined(event.model) ?? "unknown",
      deltaSequence: 0,
      content: ""
    }
    this.#turns.set(sessionId, state)
    await this.#append({
      sessionId,
      type: "assistant_stream_started",
      actor: "assistant",
      payload: {
        requestId: state.requestId,
        messageId: state.messageId,
        model: state.model,
        modelRole: "chat"
      }
    })
    return state
  }

  async #completeTurn(sessionId: string, finishReason?: string): Promise<void> {
    const state = this.#turns.get(sessionId)
    if (!state) {
      return
    }

    this.#turns.delete(sessionId)
    this.#toolCalls.delete(sessionId)
    await this.#append({
      sessionId,
      type: "assistant_message_completed",
      actor: "assistant",
      payload: {
        requestId: state.requestId,
        messageId: state.messageId,
        content: state.content,
        finishReason
      }
    })
  }

  #toolCallIdFor(sessionId: string, event: RuntimeStreamEventLike): string {
    return stringOrUndefined(event.toolCallId)
      ?? stringOrUndefined(event.callId)
      ?? stringOrUndefined(event.id)
      ?? this.#toolCallIdFactory(sessionId, event)
  }

  #setToolState(sessionId: string, state: ToolCallState): void {
    const toolCalls = this.#toolCalls.get(sessionId) ?? new Map<string, ToolCallState>()
    toolCalls.set(state.toolName, state)
    this.#toolCalls.set(sessionId, toolCalls)
  }

  #getToolState(sessionId: string, toolName: string): ToolCallState | undefined {
    return this.#toolCalls.get(sessionId)?.get(toolName)
  }

  async #append<TType extends SessionEventType>(
    input: AppendSessionEventInput<TType>
  ): Promise<void> {
    await this.#eventLog.append(input as AppendSessionEventInput<SessionEventType>)
  }

  #nextTurnSequence(sessionId: string): number {
    const next = (this.#turnSequences.get(sessionId) ?? 0) + 1
    this.#turnSequences.set(sessionId, next)
    return next
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0
    ? value
    : undefined
}

function toJsonObject(value: unknown): JsonObject {
  const json = toJsonValue(value)
  return json && typeof json === "object" && !Array.isArray(json)
    ? json as JsonObject
    : {}
}

function toJsonValue(value: unknown): JsonValue {
  if (value === undefined) {
    return null
  }
  try {
    return JSON.parse(JSON.stringify(value)) as JsonValue
  } catch {
    return String(value)
  }
}

function stableId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "_")
}
