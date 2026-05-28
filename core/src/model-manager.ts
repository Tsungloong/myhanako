import type { ModelRole, PromptBundle, PromptMessage } from "../../shared/src/prompt-bundle.ts"
import type { ToolDefinitionSnapshot } from "../../shared/src/session-events.ts"

export type ModelRoleConfig = Partial<Record<ModelRole, string>>

export type ModelManagerOptions = {
  readonly defaultModel: string
  readonly roles?: ModelRoleConfig
}

export class ModelManager {
  readonly #defaultModel: string
  readonly #roles: ModelRoleConfig

  constructor(options: ModelManagerOptions) {
    this.#defaultModel = options.defaultModel
    this.#roles = options.roles ?? {}
  }

  resolveModel(role: ModelRole): string {
    return this.#roles[role] ?? this.#defaultModel
  }
}

export type PreparedModelRequest = {
  readonly requestId: string
  readonly provider: string
  readonly model: string
  readonly modelRole: ModelRole
  readonly messages: readonly PromptMessage[]
  readonly tools: readonly ToolDefinitionSnapshot[]
  readonly strictToolMode: boolean
  readonly metadata: {
    readonly layerIds: readonly string[]
    readonly injectedMemoryIds: readonly string[]
    readonly enabledSkillIds: readonly string[]
    readonly enabledToolIds: readonly string[]
    readonly tokenEstimate: number
    readonly warnings: readonly string[]
  }
}

export type BasicModelAdapterOptions = {
  readonly provider: string
  readonly strictToolMode?: boolean
}

export class BasicModelAdapter {
  readonly #provider: string
  readonly #strictToolMode: boolean

  constructor(options: BasicModelAdapterOptions) {
    this.#provider = options.provider
    this.#strictToolMode = options.strictToolMode ?? false
  }

  prepareRequest(bundle: PromptBundle): PreparedModelRequest {
    return {
      requestId: bundle.requestId,
      provider: this.#provider,
      model: bundle.model,
      modelRole: bundle.modelRole,
      messages: bundle.messages,
      tools: bundle.toolDefinitions,
      strictToolMode: this.#strictToolMode,
      metadata: {
        layerIds: bundle.layers.map((layer) => layer.id),
        injectedMemoryIds: bundle.injectedMemoryIds,
        enabledSkillIds: bundle.enabledSkillIds,
        enabledToolIds: bundle.enabledToolIds,
        tokenEstimate: bundle.tokenEstimate,
        warnings: bundle.warnings
      }
    }
  }
}
