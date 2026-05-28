import assert from "node:assert/strict"
import test from "node:test"
import {
  InMemorySessionEventStore,
  SessionEventLog
} from "../src/session-event-log.ts"
import { PromptAssembler } from "../src/prompt-assembler.ts"
import { MemoryCompiler } from "../src/memory-compiler.ts"
import type { MemoryItem } from "../src/memory-service.ts"

test("MemoryCompiler compiles injectable scoped memories into prompt layers", async () => {
  const compiler = new MemoryCompiler({
    compilationIdFactory: () => "mem_compilation_1"
  })
  const now = new Date("2026-05-28T12:00:00.000Z")
  const items: readonly MemoryItem[] = [
    memoryItem({
      id: "memory_pinned",
      content: "Prefer compatibility-first changes.",
      type: "preference",
      visibility: "pinned",
      scope: {
        kind: "project",
        id: "myhanako"
      },
      createdAt: "2026-05-27T00:00:00.000Z"
    }),
    memoryItem({
      id: "memory_today",
      content: "Current task is P0 memory closure.",
      type: "temporary",
      scope: {
        kind: "project",
        id: "myhanako"
      },
      createdAt: "2026-05-28T08:00:00.000Z"
    }),
    memoryItem({
      id: "memory_other_project",
      content: "Other project note.",
      type: "project",
      scope: {
        kind: "project",
        id: "other"
      }
    }),
    memoryItem({
      id: "memory_candidate",
      content: "Candidate should not inject.",
      status: "candidate"
    }),
    memoryItem({
      id: "memory_expired",
      content: "Expired should not inject.",
      expiresAt: "2026-05-27T12:00:00.000Z"
    })
  ]

  const compilation = compiler.compile({
    items,
    now,
    scope: {
      projectId: "myhanako"
    }
  })

  assert.equal(compilation.compilationId, "mem_compilation_1")
  assert.deepEqual(compilation.memoryIds, ["memory_pinned", "memory_today"])
  assert.deepEqual(
    compilation.layers.map((layer) => layer.id),
    ["memory:pinned", "memory:today"]
  )
  assert.match(compilation.layers[0].content, /memory_pinned/)
  assert.match(compilation.layers[0].content, /evt_memory_pinned/)
  assert.match(compilation.layers[1].content, /Current task is P0 memory closure/)

  const bundle = new PromptAssembler({ requestIdFactory: () => "req_memory" }).assemble({
    model: "local-test",
    modelRole: "chat",
    layers: compilation.layers,
    injectedMemoryIds: compilation.memoryIds
  })
  assert.deepEqual(bundle.injectedMemoryIds, ["memory_pinned", "memory_today"])
})

test("MemoryCompiler records memory_compiled events for compiled prompt input", async () => {
  const eventLog = new SessionEventLog({
    store: new InMemorySessionEventStore(),
    clock: () => new Date("2026-05-28T00:00:00.000Z"),
    idFactory: (event) => `evt_${event.sequence}`
  })
  const compiler = new MemoryCompiler({
    compilationIdFactory: () => "mem_compilation_2"
  })
  const compilation = compiler.compile({
    items: [
      memoryItem({
        id: "memory_fact",
        content: "PiAgent core owns prompt assembly.",
        type: "fact"
      })
    ],
    now: new Date("2026-05-28T00:00:00.000Z")
  })

  const event = await compiler.recordCompilationEvent({
    eventLog,
    sessionId: "session_memory",
    compilation,
    correlationId: "corr_memory"
  })

  assert.equal(event.type, "memory_compiled")
  assert.equal(event.correlationId, "corr_memory")
  assert.deepEqual(event.payload, {
    compilationId: "mem_compilation_2",
    layers: ["memory:facts"],
    memoryIds: ["memory_fact"]
  })
})

function memoryItem(overrides: Partial<MemoryItem>): MemoryItem {
  const id = overrides.id ?? "memory_default"
  const createdAt = overrides.createdAt ?? "2026-05-20T00:00:00.000Z"
  return {
    id,
    type: "fact",
    content: "Default memory content.",
    sourceSessionId: "session_source",
    sourceEventIds: [`evt_${id}`],
    confidence: 0.9,
    status: "active",
    visibility: "normal",
    scope: {
      kind: "global"
    },
    createdAt,
    updatedAt: createdAt,
    tags: [],
    ...overrides
  }
}