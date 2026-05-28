import assert from "node:assert/strict"
import test from "node:test"
import {
  InMemorySessionEventStore,
  SessionEventLog
} from "../src/session-event-log.ts"
import { InMemoryMemoryStore, MemoryService } from "../src/memory-service.ts"

test("MemoryService creates user-visible memory items and records creation events", async () => {
  const eventLog = new SessionEventLog({
    store: new InMemorySessionEventStore(),
    clock: () => new Date("2026-05-28T00:00:00.000Z"),
    idFactory: (event) => `evt_${event.sequence}`
  })
  const service = new MemoryService({
    store: new InMemoryMemoryStore(),
    clock: () => new Date("2026-05-28T00:00:00.000Z"),
    idFactory: () => "memory_1"
  })

  const item = await service.createItem(
    {
      type: "preference",
      content: "User prefers compatibility-first implementation.",
      sourceSessionId: "session_source",
      sourceEventIds: ["evt_source_1"],
      confidence: 0.92,
      status: "active",
      visibility: "pinned",
      scope: {
        kind: "project",
        id: "myhanako"
      },
      tags: ["architecture"]
    },
    {
      sessionId: "session_memory",
      eventLog,
      correlationId: "corr_memory"
    }
  )

  assert.deepEqual(item, {
    id: "memory_1",
    type: "preference",
    content: "User prefers compatibility-first implementation.",
    sourceSessionId: "session_source",
    sourceEventIds: ["evt_source_1"],
    confidence: 0.92,
    status: "active",
    visibility: "pinned",
    scope: {
      kind: "project",
      id: "myhanako"
    },
    createdAt: "2026-05-28T00:00:00.000Z",
    updatedAt: "2026-05-28T00:00:00.000Z",
    tags: ["architecture"]
  })
  assert.deepEqual(await service.listItems(), [item])

  const events = await eventLog.listSessionEvents("session_memory")
  assert.equal(events[0].type, "memory_item_created")
  assert.equal(events[0].correlationId, "corr_memory")
  assert.deepEqual(events[0].payload, {
    memoryId: "memory_1",
    status: "active",
    content: "User prefers compatibility-first implementation."
  })
})

test("MemoryService applies user corrections and records update/delete events", async () => {
  const eventLog = new SessionEventLog({
    store: new InMemorySessionEventStore(),
    clock: () => new Date("2026-05-28T00:00:00.000Z"),
    idFactory: (event) => `evt_${event.sequence}`
  })
  const service = new MemoryService({
    store: new InMemoryMemoryStore(),
    clock: () => new Date("2026-05-28T00:00:00.000Z"),
    idFactory: () => "memory_1"
  })

  await service.createItem({
    type: "fact",
    content: "Draft content.",
    sourceSessionId: "session_source",
    sourceEventIds: ["evt_source_1"],
    confidence: 0.6,
    status: "candidate",
    visibility: "normal",
    scope: {
      kind: "global"
    },
    tags: []
  })

  const updated = await service.updateItem(
    "memory_1",
    {
      content: "Reviewed content.",
      status: "active",
      confidence: 1
    },
    {
      sessionId: "session_memory",
      eventLog
    }
  )
  await service.deleteItem("memory_1", "user_removed", {
    sessionId: "session_memory",
    eventLog
  })

  assert.equal(updated.content, "Reviewed content.")
  assert.equal(updated.status, "active")
  assert.deepEqual(await service.listItems(), [])

  const events = await eventLog.listSessionEvents("session_memory")
  assert.deepEqual(
    events.map((event) => event.type),
    ["memory_item_updated", "memory_item_deleted"]
  )
  assert.deepEqual(events[0].payload, {
    memoryId: "memory_1",
    changes: {
      content: "Reviewed content.",
      status: "active",
      confidence: 1
    }
  })
  assert.deepEqual(events[1].payload, {
    memoryId: "memory_1",
    reason: "user_removed"
  })
})