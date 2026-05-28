import assert from "node:assert/strict"
import test from "node:test"
import { BasicModelAdapter, ModelManager } from "../src/model-manager.ts"
import type { PromptBundle } from "../../shared/src/prompt-bundle.ts"

test("ModelManager maps all P0 roles to the main model by default", () => {
  const manager = new ModelManager({
    defaultModel: "deepseek-chat"
  })

  assert.equal(manager.resolveModel("chat"), "deepseek-chat")
  assert.equal(manager.resolveModel("smallTool"), "deepseek-chat")
  assert.equal(manager.resolveModel("largeTool"), "deepseek-chat")
  assert.equal(manager.resolveModel("vision"), "deepseek-chat")
})

test("ModelManager preserves role-specific model overrides", () => {
  const manager = new ModelManager({
    defaultModel: "deepseek-chat",
    roles: {
      smallTool: "deepseek-small",
      vision: "vision-model"
    }
  })

  assert.equal(manager.resolveModel("chat"), "deepseek-chat")
  assert.equal(manager.resolveModel("smallTool"), "deepseek-small")
  assert.equal(manager.resolveModel("largeTool"), "deepseek-chat")
  assert.equal(manager.resolveModel("vision"), "vision-model")
})

test("BasicModelAdapter prepares an auditable provider-neutral request", () => {
  const adapter = new BasicModelAdapter({
    provider: "local-test",
    strictToolMode: true
  })

  const preparedRequest = adapter.prepareRequest({
    ...promptBundleFixture(),
    model: "deepseek-chat",
    modelRole: "smallTool"
  })

  assert.equal(preparedRequest.requestId, "req_model")
  assert.equal(preparedRequest.provider, "local-test")
  assert.equal(preparedRequest.model, "deepseek-chat")
  assert.equal(preparedRequest.modelRole, "smallTool")
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
