import type { ModelRole, PromptBundle, PromptMessage } from "../../shared/src/prompt-bundle.ts"
import {
  findModel,
  modelRefKey,
  requireModelRef,
  type ModelRef,
  type StrictModelRef
} from "../../shared/src/model-ref.ts"
import type { ToolDefinitionSnapshot } from "../../shared/src/session-events.ts"

export type AvailableModel = StrictModelRef & {
  readonly name?: string
  readonly capabilities?: {
    readonly input?: readonly string[]
    readonly contextWindow?: number
    readonly maxTokens?: number
    readonly reasoning?: boolean
  }
}

export type ModelRoleConfig = Partial<Record<ModelRole | "utility" | "utility_large", ModelRef | string>>

export type ProviderConfig = {
  readonly id?: string
  readonly api: string
  readonly apiKey: string
  readonly baseUrl: string
  readonly strictToolMode?: boolean
  readonly allowMissingApiKey?: boolean
}

export type ModelManagerOptions = {
  readonly availableModels: readonly AvailableModel[]
  readonly defaultModel?: ModelRef | string
  readonly roles?: ModelRoleConfig
  readonly providers?: Record<string, ProviderConfig>
}

export class ModelManager {
  readonly #availableModels: readonly AvailableModel[]
  readonly #defaultModel?: ModelRef | string
  readonly #roles: ModelRoleConfig
  readonly #providers: Record<string, ProviderConfig>

  constructor(options: ModelManagerOptions) {
    this.#availableModels = [...options.availableModels]
    this.#defaultModel = options.defaultModel
    this.#roles = options.roles ?? {}
    this.#providers = options.providers ?? {}
  }

  get availableModels(): readonly AvailableModel[] {
    return this.#availableModels
  }

  resolveModel(role: ModelRole): AvailableModel {
    const modelRef = this.#resolveRoleRef(role)
    return this.resolveExecutionModel(modelRef)
  }

  resolveExecutionModel(modelRef?: ModelRef | string): AvailableModel {
    const ref = modelRef === undefined || modelRef === null || modelRef === ""
      ? this.#defaultModel
      : modelRef
    const requiredRef = requireModelRef(ref)
    const model = findModel(this.#availableModels, requiredRef)
    if (!model) {
      throw new Error(`Model not available: ${modelRefKey(requiredRef)}`)
    }

    return model
  }

  resolveModelWithCredentials(modelRef?: ModelRef | string): ResolvedModelWithCredentials {
    const model = this.resolveExecutionModel(modelRef)
    const providerConfig = this.#providers[model.provider]
    if (!providerConfig) {
      throw new Error(`Provider missing credentials: ${model.provider}`)
    }

    if (!providerConfig.api || !providerConfig.baseUrl) {
      throw new Error(`Provider missing credentials: ${model.provider}`)
    }

    if (!providerConfig.apiKey && providerConfig.allowMissingApiKey !== true) {
      throw new Error(`Provider missing credentials: ${model.provider}`)
    }

    return {
      model,
      provider: model.provider,
      api: providerConfig.api,
      apiKey: providerConfig.apiKey,
      baseUrl: providerConfig.baseUrl,
      strictToolMode: providerConfig.strictToolMode === true
    }
  }

  #resolveRoleRef(role: ModelRole): ModelRef | string | undefined {
    if (this.#roles[role]) {
      return this.#roles[role]
    }

    if (role === "smallTool" && this.#roles.utility) {
      return this.#roles.utility
    }

    if (role === "largeTool" && this.#roles.utility_large) {
      return this.#roles.utility_large
    }

    return this.#defaultModel
  }
}

export type ResolvedModelWithCredentials = {
  readonly model: AvailableModel
  readonly provider: string
  readonly api: string
  readonly apiKey: string
  readonly baseUrl: string
  readonly strictToolMode: boolean
}

export type PreparedModelRequest = {
  readonly requestId: string
  readonly provider: string
  readonly api: string
  readonly baseUrl: string
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
  readonly provider: ProviderConfig & {
    readonly id: string
  }
}

export class BasicModelAdapter {
  readonly #provider: ProviderConfig & {
    readonly id: string
  }

  constructor(options: BasicModelAdapterOptions) {
    this.#provider = options.provider
  }

  prepareRequest(bundle: PromptBundle): PreparedModelRequest {
    return {
      requestId: bundle.requestId,
      provider: this.#provider.id,
      api: this.#provider.api,
      baseUrl: this.#provider.baseUrl,
      model: bundle.model,
      modelRole: bundle.modelRole,
      messages: bundle.messages,
      tools: bundle.toolDefinitions,
      strictToolMode: this.#provider.strictToolMode === true,
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
