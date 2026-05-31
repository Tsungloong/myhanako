import assert from "node:assert/strict"
import path from "node:path"
import test from "node:test"
import { BasicModelAdapter, ModelManager, createPiModelBridge } from "../src/model-manager.ts"
import type { PromptBundle } from "../../shared/src/prompt-bundle.ts"

test("ModelManager resolves P0 roles from availableModels as the single truth source", () => {
  const availableModels = [
    { id: "deepseek-chat", provider: "deepseek" },
    { id: "deepseek-small", provider: "deepseek" },
    { id: "vision-model", provider: "openai" }
  ]
  const manager = new ModelManager({
    availableModels,
    defaultModel: { id: "deepseek-chat", provider: "deepseek" },
    roles: {
      smallTool: { id: "deepseek-small", provider: "deepseek" },
      vision: { id: "vision-model", provider: "openai" }
    }
  })

  assert.equal(manager.resolveModel("chat"), availableModels[0])
  assert.equal(manager.resolveModel("smallTool"), availableModels[1])
  assert.equal(manager.resolveModel("largeTool"), availableModels[0])
  assert.equal(manager.resolveModel("vision"), availableModels[2])
})

test("ModelManager rejects role refs that are missing provider instead of guessing", () => {
  const manager = new ModelManager({
    availableModels: [
      { id: "deepseek-chat", provider: "deepseek" },
      { id: "deepseek-chat", provider: "gateway" }
    ],
    defaultModel: { id: "deepseek-chat", provider: "deepseek" },
    roles: {
      smallTool: "deepseek-chat"
    }
  })

  assert.throws(() => manager.resolveModel("smallTool"), /missing id or provider/)
})

test("ModelManager resolves full model objects with provider credentials", () => {
  const manager = new ModelManager({
    availableModels: [
      {
        id: "deepseek-chat",
        provider: "deepseek",
        capabilities: {
          input: ["text"],
          contextWindow: 128000
        }
      }
    ],
    defaultModel: { id: "deepseek-chat", provider: "deepseek" },
    providers: {
      deepseek: {
        api: "openai-completions",
        apiKey: "sk-test",
        baseUrl: "https://api.deepseek.com/v1",
        strictToolMode: true
      }
    }
  })

  assert.deepEqual(manager.resolveModelWithCredentials("deepseek/deepseek-chat"), {
    model: {
      id: "deepseek-chat",
      provider: "deepseek",
      capabilities: {
        input: ["text"],
        contextWindow: 128000
      }
    },
    provider: "deepseek",
    api: "openai-completions",
    apiKey: "sk-test",
    baseUrl: "https://api.deepseek.com/v1",
    strictToolMode: true
  })
})

test("ModelManager refuses missing provider credentials unless explicitly allowed", () => {
  const manager = new ModelManager({
    availableModels: [{ id: "llama3", provider: "ollama" }],
    defaultModel: { id: "llama3", provider: "ollama" },
    providers: {
      ollama: {
        api: "openai-completions",
        apiKey: "",
        baseUrl: "http://192.168.1.20:11434/v1"
      }
    }
  })

  assert.throws(
    () => manager.resolveModelWithCredentials({ id: "llama3", provider: "ollama" }),
    /missing credentials/
  )
})

test("ModelManager allows keyless local providers when the provider declares it", () => {
  const manager = new ModelManager({
    availableModels: [{ id: "llama3", provider: "ollama" }],
    defaultModel: { id: "llama3", provider: "ollama" },
    providers: {
      ollama: {
        api: "openai-completions",
        apiKey: "",
        baseUrl: "http://127.0.0.1:11434/v1",
        allowMissingApiKey: true
      }
    }
  })

  const resolved = manager.resolveModelWithCredentials({ id: "llama3", provider: "ollama" })

  assert.equal(resolved.apiKey, "")
  assert.equal(resolved.baseUrl, "http://127.0.0.1:11434/v1")
})

test("ModelManager refreshes available models from an injected Pi ModelRegistry", async () => {
  const registryModel = {
    id: "gpt-4.1",
    provider: "openai",
    capabilities: {
      input: ["text"],
      contextWindow: 128000
    }
  }
  const authStorage = { kind: "auth-storage" }
  const modelRegistry = {
    async getAvailable() {
      return [registryModel]
    }
  }
  const manager = new ModelManager({
    availableModels: [{ id: "old-model", provider: "openai" }],
    defaultModel: { id: "gpt-4.1", provider: "openai" },
    piModelBridge: {
      authStorage,
      modelRegistry,
      authJsonPath: "F:\\myhanako\\auth.json",
      modelsJsonPath: "F:\\myhanako\\models.json"
    }
  })

  const refreshed = await manager.refreshAvailableModelsFromRegistry()

  assert.equal(manager.authStorage, authStorage)
  assert.equal(manager.modelRegistry, modelRegistry)
  assert.equal(manager.authJsonPath, "F:\\myhanako\\auth.json")
  assert.equal(manager.modelsJsonPath, "F:\\myhanako\\models.json")
  assert.deepEqual(refreshed, [registryModel])
  assert.equal(manager.resolveExecutionModel("openai/gpt-4.1"), registryModel)
  assert.equal(manager.defaultModel, registryModel)
})

test("ModelManager reports Pi registry credential status without exposing secrets", async () => {
  const model = { id: "gpt-4.1", provider: "openai" }
  const manager = new ModelManager({
    availableModels: [model],
    defaultModel: model,
    piModelBridge: {
      authStorage: { kind: "auth-storage" },
      modelRegistry: {
        async getAvailable() {
          return [model]
        },
        async getApiKeyAndHeaders(receivedModel: unknown) {
          assert.equal(receivedModel, model)
          return {
            ok: true,
            apiKey: "sk-secret",
            headers: {
              "x-provider-token": "hidden"
            }
          }
        }
      }
    }
  })

  assert.deepEqual(await manager.resolveModelCredentialStatus("openai/gpt-4.1"), {
    provider: "openai",
    modelId: "gpt-4.1",
    ok: true,
    hasApiKey: true,
    hasHeaders: true
  })
})

test("ModelManager rejects Pi registry models that are missing provider identity", async () => {
  const manager = new ModelManager({
    availableModels: [],
    piModelBridge: {
      authStorage: {},
      modelRegistry: {
        async getAvailable() {
          return [{ id: "gpt-4.1", provider: "" }]
        }
      }
    }
  })

  await assert.rejects(
    () => manager.refreshAvailableModelsFromRegistry(),
    /missing id or provider/
  )
})

test("ModelManager reports missing Pi registry credentials as an explicit status", async () => {
  const model = { id: "gpt-4.1", provider: "openai" }
  const manager = new ModelManager({
    availableModels: [model],
    defaultModel: model,
    piModelBridge: {
      authStorage: {},
      modelRegistry: {
        async getAvailable() {
          return [model]
        },
        async getApiKeyAndHeaders() {
          return {
            ok: false,
            error: "No API key configured"
          }
        }
      }
    }
  })

  assert.deepEqual(await manager.resolveModelCredentialStatus("openai/gpt-4.1"), {
    provider: "openai",
    modelId: "gpt-4.1",
    ok: false,
    reason: "No API key configured",
    hasApiKey: false,
    hasHeaders: false
  })
})

test("createPiModelBridge creates AuthStorage and ModelRegistry under the myhanako home", async () => {
  const authStorage = { kind: "auth-storage" }
  const modelRegistry = {
    async getAvailable() {
      return []
    }
  }
  const calls: string[] = []
  const bridge = await createPiModelBridge({
    myhanakoHome: "F:\\myhanako",
    piSdk: {
      AuthStorage: {
        create(authJsonPath: string) {
          calls.push(authJsonPath)
          return authStorage
        }
      },
      createModelRegistry(receivedAuthStorage: unknown, modelsJsonPath: string) {
        assert.equal(receivedAuthStorage, authStorage)
        calls.push(modelsJsonPath)
        return modelRegistry
      }
    }
  })

  assert.equal(bridge.authStorage, authStorage)
  assert.equal(bridge.modelRegistry, modelRegistry)
  assert.equal(bridge.authJsonPath, path.join("F:\\myhanako", "auth.json"))
  assert.equal(bridge.modelsJsonPath, path.join("F:\\myhanako", "models.json"))
  assert.deepEqual(calls, [
    path.join("F:\\myhanako", "auth.json"),
    path.join("F:\\myhanako", "models.json")
  ])
})

test("BasicModelAdapter prepares an auditable provider-neutral request", () => {
  const adapter = new BasicModelAdapter({
    provider: {
      id: "deepseek",
      api: "openai-completions",
      apiKey: "sk-test",
      baseUrl: "https://api.deepseek.com/v1",
      strictToolMode: true
    }
  })

  const preparedRequest = adapter.prepareRequest({
    ...promptBundleFixture(),
    model: "deepseek-chat",
    modelRole: "smallTool"
  })

  assert.equal(preparedRequest.requestId, "req_model")
  assert.equal(preparedRequest.provider, "deepseek")
  assert.equal(preparedRequest.model, "deepseek-chat")
  assert.equal(preparedRequest.modelRole, "smallTool")
  assert.equal(preparedRequest.api, "openai-completions")
  assert.equal(preparedRequest.baseUrl, "https://api.deepseek.com/v1")
  assert.equal(preparedRequest.strictToolMode, true)
  assert.deepEqual(preparedRequest.messages, [
    {
      role: "system",
      content: "use controlled tools",
      layerId: "runtime_contract"
    }
  ])
  assert.deepEqual(preparedRequest.tools, [
    {
      id: "tool_read",
      name: "read_file",
      source: "builtin",
      description: "Read a workspace file.",
      schemaChecksum: "sha256:schema",
      permissions: ["workspace:read"]
    }
  ])
  assert.deepEqual(preparedRequest.metadata, {
    layerIds: ["runtime_contract"],
    injectedMemoryIds: ["memory_1"],
    enabledSkillIds: ["skill_1"],
    enabledToolIds: ["tool_read"],
    tokenEstimate: 4,
    warnings: []
  })
})

function promptBundleFixture(): PromptBundle {
  return {
    requestId: "req_model",
    model: "local-test",
    modelRole: "chat",
    messages: [
      {
        role: "system",
        content: "use controlled tools",
        layerId: "runtime_contract"
      }
    ],
    toolDefinitions: [
      {
        id: "tool_read",
        name: "read_file",
        source: "builtin",
        description: "Read a workspace file.",
        schemaChecksum: "sha256:schema",
        permissions: ["workspace:read"]
      }
    ],
    layers: [
      {
        id: "runtime_contract",
        source: "builtin",
        priority: 10,
        enabled: true,
        editable: false,
        tokenBudget: 200,
        version: "1",
        checksum: "sha256:layer"
      }
    ],
    injectedMemoryIds: ["memory_1"],
    enabledSkillIds: ["skill_1"],
    enabledToolIds: ["tool_read"],
    tokenEstimate: 4,
    warnings: []
  }
}
