import assert from "node:assert/strict"
import test from "node:test"
import { BasicModelAdapter, ModelManager } from "../src/model-manager.ts"
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
