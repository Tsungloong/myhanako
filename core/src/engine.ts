import type {
  CreateSessionOptions,
  InterruptSessionOptions,
  RecoverSessionOptions,
  SendSessionMessageOptions,
  SessionCoordinatorState
} from "./session-coordinator.ts"

export type EngineSessionCoordinator = {
  readonly createSession: (options: unknown) => Promise<SessionCoordinatorState | unknown>
  readonly recoverSession: (options: unknown) => Promise<SessionCoordinatorState | unknown>
  readonly sendMessage?: (options: unknown) => Promise<unknown>
  readonly interruptCurrentSession?: (options?: unknown) => Promise<unknown>
  readonly disposeCurrentSession: (reason?: string) => Promise<void>
}

export type EngineOptions = {
  readonly sessionCoordinator: EngineSessionCoordinator
  readonly modelManager: unknown
  readonly resourceLoader?: unknown
}

export class Engine {
  readonly #sessionCoordinator: EngineSessionCoordinator
  readonly #modelManager: unknown
  readonly #resourceLoader?: unknown

  constructor(options: EngineOptions) {
    this.#sessionCoordinator = options.sessionCoordinator
    this.#modelManager = options.modelManager
    this.#resourceLoader = options.resourceLoader
  }

  get modelManager(): unknown {
    return this.#modelManager
  }

  get resourceLoader(): unknown {
    return this.#resourceLoader
  }

  createSession(options: Partial<CreateSessionOptions>): Promise<SessionCoordinatorState | unknown> {
    return this.#sessionCoordinator.createSession(options)
  }

  recoverSession(options: Partial<RecoverSessionOptions>): Promise<SessionCoordinatorState | unknown> {
    return this.#sessionCoordinator.recoverSession(options)
  }

  sendMessage(options: SendSessionMessageOptions): Promise<unknown> {
    if (!this.#sessionCoordinator.sendMessage) {
      throw new Error("Engine session coordinator does not support sendMessage")
    }
    return this.#sessionCoordinator.sendMessage(options)
  }

  interruptCurrentSession(options: InterruptSessionOptions = {}): Promise<unknown> {
    if (!this.#sessionCoordinator.interruptCurrentSession) {
      throw new Error("Engine session coordinator does not support interruptCurrentSession")
    }
    return this.#sessionCoordinator.interruptCurrentSession(options)
  }

  disposeCurrentSession(reason?: string): Promise<void> {
    return this.#sessionCoordinator.disposeCurrentSession(reason)
  }
}
