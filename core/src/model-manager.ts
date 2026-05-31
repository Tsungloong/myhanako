import path from "node:path"
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

export type PiModelRegistryAuthResult = {
  readonly ok: boolean
  readonly apiKey?: string
  readonly headers?: Record<string, string>
  readonly error?: string
}

export type PiModelRegistryBridge = {
  readonly getAvailable: () => Promise<readonly unknown[]>
  readonly getApiKeyAndHeaders?: (model: AvailableModel) => Promise<PiModelRegistryAuthResult>
}

export type PiModelBridge = {
  readonly authStorage: unknown
  readonly modelRegistry: PiModelRegistryBridge
  readonly authJsonPath?: string
  readonly modelsJsonPath?: string
}

export type PiSdkModelFactory = {
  readonly AuthStorage: {
    readonly create: (authJsonPath: string) => unknown
  }
  readonly createModelRegistry: (authStorage: unknown, modelsJsonPath: string) => PiModelRegistryBridge
}

export type CreatePiModelBridgeOptions = {
  readonly myhanakoHome: string
  readonly piSdk?: PiSdkModelFactory
}

export type ModelManagerOptions = {
  readonly availableModels: readonly AvailableModel[]
  readonly defaultModel?: ModelRef | string
  readonly roles?: ModelRoleConfig
  readonly providers?: Record<string, ProviderConfig>
  readonly piModelBridge?: PiModelBridge
}

export async function createPiModelBridge(options: CreatePiModelBridgeOptions): Promise<PiModelBridge> {
  if (typeof options.myhanakoHome !== "string" || options.myhanakoHome.trim().length === 0) {
    throw new Error("createPiModelBridge: myhanakoHome is required")
  }

  const piSdk = options.piSdk ?? await import("../../lib/pi-sdk/index.ts")
  const authJsonPath = path.join(options.myhanakoHome, "auth.json")
  const modelsJsonPath = path.join(options.myhanakoHome, "models.json")
  const authStorage = piSdk.AuthStorage.create(authJsonPath)
  const modelRegistry = piSdk.createModelRegistry(authStorage, modelsJsonPath)

  return {
    authStorage,
    modelRegistry,
    authJsonPath,
    modelsJsonPath
  }
}

export class ModelManager {
  #availableModels: readonly AvailableModel[]
  #defaultModel?: ModelRef | string
  readonly #roles: ModelRoleConfig
  readonly #providers: Record<string, ProviderConfig>
  readonly #piModelBridge?: PiModelBridge

  constructor(options: ModelManagerOptions) {
    this.#availableModels = [...options.availableModels]
    this.#defaultModel = options.defaultModel
    this.#roles = options.roles ?? {}
    this.#providers = options.providers ?? {}
    this.#piModelBridge = options.piModelBridge
  }

  get availableModels(): readonly AvailableModel[] {
    return this.#availableModels
  }

  get authStorage(): unknown {
    return this.#piModelBridge?.authStorage
  }

  get modelRegistry(): PiModelRegistryBridge | undefined {
    return this.#piModelBridge?.modelRegistry
  }

  get authJsonPath(): string | undefined {
    return this.#piModelBridge?.authJsonPath
  }

  get modelsJsonPath(): string | undefined {
    return this.#piModelBridge?.modelsJsonPath
  }

  get defaultModel(): AvailableModel | ModelRef | string | undefined {
    return this.#defaultModel
  }

  async refreshAvailableModelsFromRegistry(): Promise<readonly AvailableModel[]> {
    const registry = this.#piModelBridge?.modelRegistry
    if (!registry) {
      throw new Error("Pi ModelRegistry is not configured")
    }

    const registryModels = await registry.getAvailable()
    this.#availableModels = registryModels.map(assertAvailableModelFromRegistry)
    this.#rebindDefaultModel()
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

  async resolveModelCredentialStatus(modelRef?: ModelRef | string): Promise<ModelCredentialStatus> {
    const model = this.resolveExecutionModel(modelRef)
    const registry = this.#piModelBridge?.modelRegistry
    if (registry?.getApiKeyAndHeaders) {
      const auth = await registry.getApiKeyAndHeaders(model)
      return {
        provider: model.provider,
        modelId: model.id,
        ok: auth.ok === true,
        ...(auth.ok === true ? {} : { reason: auth.error || "Pi ModelRegistry credential lookup failed" }),
        hasApiKey: typeof auth.apiKey === "string" && auth.apiKey.length > 0,
        hasHeaders: !!auth.headers && Object.keys(auth.headers).length > 0
      }
    }

    return this.#resolveConfiguredProviderCredentialStatus(model)
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

  #resolveConfiguredProviderCredentialStatus(model: AvailableModel): ModelCredentialStatus {
    const providerConfig = this.#providers[model.provider]
    const hasApi = typeof providerConfig?.api === "string" && providerConfig.api.length > 0
    const hasBaseUrl = typeof providerConfig?.baseUrl === "string" && providerConfig.baseUrl.length > 0
    const hasApiKey = typeof providerConfig?.apiKey === "string" && providerConfig.apiKey.length > 0
    const allowsMissingApiKey = providerConfig?.allowMissingApiKey === true
    const ok = !!providerConfig && hasApi && hasBaseUrl && (hasApiKey || allowsMissingApiKey)

    return {
      provider: model.provider,
      modelId: model.id,
      ok,
      ...(ok ? {} : { reason: `Provider missing credentials: ${model.provider}` }),
      hasApiKey,
      hasHeaders: false
    }
  }

  #rebindDefaultModel(): void {
    if (!this.#defaultModel) {
      return
    }

    const defaultRef = requireModelRef(this.#defaultModel)
    this.#defaultModel = findModel(this.#availableModels, defaultRef) ?? undefined
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

export type ModelCredentialStatus = {
  readonly provider: string
  readonly modelId: string
  readonly ok: boolean
  readonly reason?: string
  readonly hasApiKey: boolean
  readonly hasHeaders: boolean
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

function assertAvailableModelFromRegistry(model: unknown): AvailableModel {
  if (!model || typeof model !== "object") {
    throw new TypeError("Pi ModelRegistry returned a model missing id or provider")
  }

  const candidate = model as Partial<AvailableModel>
  if (typeof candidate.id !== "string" || candidate.id.length === 0 || typeof candidate.provider !== "string" || candidate.provider.length === 0) {
    throw new TypeError("Pi ModelRegistry returned a model missing id or provider")
  }

  return candidate as AvailableModel
}
