import assert from "node:assert/strict"
import test from "node:test"
import {
  InMemorySessionEventStore,
  SessionEventLog
} from "../src/session-event-log.ts"
import { PromptAssembler } from "../src/prompt-assembler.ts"

test("PromptAssembler resolves enabled layers into an auditable PromptBundle", () => {
  const assembler = new PromptAssembler({
    requestIdFactory: () => "req_prompt_1",
    tokenEstimator: (content) => content.split(/\s+/).filter(Boolean).length
  })

  const bundle = assembler.assemble({
    model: "local-test",
    modelRole: "chat",
    layers: [
      {
        id: "developer_overrides",
        source: "project",
        priority: 30,
        enabled: true,
        editable: true,
        tokenBudget: 2,
        version: "1",
        content: "prefer compatibility first"
      },
      {
        id: "runtime_contract",
        source: "builtin",
        priority: 10,
        enabled: true,
        editable: false,
        version: "1",
        content: "use controlled tools"
      },
      {
        id: "disabled_skill",
        source: "skill",
        priority: 20,
        enabled: false,
        editable: true,
        version: "1",
        content: "do not include me"
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
    injectedMemoryIds: ["memory_project"],
    enabledSkillIds: ["skill_core"]
  })

  assert.equal(bundle.requestId, "req_prompt_1")
  assert.deepEqual(
    bundle.layers.map((layer) => layer.id),
    ["runtime_contract", "developer_overrides"]
  )
  assert.deepEqual(
    bundle.messages.map((message) => message.content),
    ["use controlled tools", "prefer compatibility first"]
  )
  assert.deepEqual(bundle.enabledToolIds, ["tool_read"])
  assert.equal(bundle.tokenEstimate, 6)
  assert.match(bundle.layers[0].checksum, /^sha256:/)
  assert.deepEqual(bundle.warnings, [
    "Prompt layer developer_overrides exceeds tokenBudget: estimated 3 > 2"
  ])
})

test("PromptAssembler records prompt, memory, tool, and model request events", async () => {
  const log = new SessionEventLog({
    store: new InMemorySessionEventStore(),
    clock: () => new Date("2026-05-28T00:00:00.000Z"),
    idFactory: (event) => `evt_${event.sequence}`
  })
  const assembler = new PromptAssembler({
    requestIdFactory: () => "req_prompt_2"
  })
  const bundle = assembler.assemble({
    model: "local-test",
    modelRole: "smallTool",
    layers: [
      {
        id: "runtime_contract",
        source: "builtin",
        priority: 10,
        enabled: true,
        editable: false,
        version: "1",
        content: "use tool boundaries"
      }
    ],
    toolDefinitions: [
      {
        id: "tool_patch",
        name: "propose_patch",
        source: "builtin",
        description: "Propose a patch.",
        schemaChecksum: "sha256:schema",
        permissions: ["workspace:write"]
      }
    ],
    injectedMemoryIds: ["memory_1"]
  })

  const recordedEvents = await assembler.recordPromptBundleEvents({
    log,
    sessionId: "session_prompt",
    bundle,
    correlationId: "corr_prompt"
  })

  assert.deepEqual(
    recordedEvents.map((event) => event.type),
    [
      "prompt_layers_resolved",
      "memory_injected",
      "tools_resolved",
      "model_request_started"
    ]
  )
  assert.deepEqual(
    (await log.listSessionEvents("session_prompt")).map((event) => event.type),
    recordedEvents.map((event) => event.type)
  )
  assert.equal(recordedEvents[0].payload.requestId, "req_prompt_2")
  assert.deepEqual(recordedEvents[1].payload.memoryIds, ["memory_1"])
  assert.equal(recordedEvents[2].payload.tools[0].id, "tool_patch")
  assert.equal(recordedEvents[3].payload.modelRole, "smallTool")
})
