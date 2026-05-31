import {
  resolveRuntimeResourceContributions,
  type ResolveRuntimeResourceContributionsOptions
} from "./runtime-contributions.ts"
import type {
  RuntimeResourceContributions,
  SessionRuntimeResources
} from "./runtime-resource-loader.ts"
import type { SessionCoordinatorRuntime } from "./session-coordinator.ts"

export type SessionRuntimeResourceLoaderLike = {
  readonly reload: (
    contributions: RuntimeResourceContributions
  ) => unknown | Promise<unknown>
  readonly toSessionRuntime: () => SessionRuntimeResources
}

export type SessionRuntimeResolverOptions =
  ResolveRuntimeResourceContributionsOptions & {
    readonly authStorage: unknown
    readonly modelRegistry: unknown
    readonly settingsManager?: unknown
    readonly runtimeResourceLoader: SessionRuntimeResourceLoaderLike
  }

export class SessionRuntimeResolver {
  readonly #options: SessionRuntimeResolverOptions

  constructor(options: SessionRuntimeResolverOptions) {
    this.#options = options
  }

  async resolve(): Promise<SessionCoordinatorRuntime> {
    const contributions = resolveRuntimeResourceContributions(this.#options)
    await this.#options.runtimeResourceLoader.reload(contributions)
    const resources = this.#options.runtimeResourceLoader.toSessionRuntime()
    const runtime: SessionCoordinatorRuntime = {
      authStorage: this.#options.authStorage,
      modelRegistry: this.#options.modelRegistry,
      resourceLoader: resources.resourceLoader,
      tools: resources.tools,
      customTools: resources.customTools
    }

    if (this.#options.settingsManager !== undefined) {
      return {
        ...runtime,
        settingsManager: this.#options.settingsManager
      }
    }
    return runtime
  }
}
