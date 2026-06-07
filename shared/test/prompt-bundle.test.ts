import assert from "node:assert/strict"
import test from "node:test"
import type { PromptBundle } from "../src/prompt-bundle.ts"

test("PromptBundle preserves the auditable model request surface from the design", () => {
  const bundle = {
    requestId: "req_1",
    model: "local-test",
    modelRole: "chat",
    messages: [
      {
        role: "system",
        content: "runtime contract"
      }
    ],
    toolDefinitions: [],
    layers: [
      {
        id: "runtime_contract",
        source: "builtin",
        priority: 10,
        enabled: true,
        editable: false,
        tokenBudget: 200,
        version: "1",
        checksum: "sha256:test"
      }
    ],
    injectedMemoryIds: ["memory_1"],
    enabledSkillIds: ["skill_1"],
    enabledToolIds: ["tool_1"],
    tokenEstimate: 4,
    warnings: []
  } satisfies PromptBundle

  assert.equal(bundle.requestId, "req_1")
  assert.equal(bundle.layers[0].id, "runtime_contract")
  assert.deepEqual(bundle.injectedMemoryIds, ["memory_1"])
  assert.deepEqual(bundle.enabledToolIds, ["tool_1"])
})
