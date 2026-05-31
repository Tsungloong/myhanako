import assert from "node:assert/strict"
import { mkdtemp, readFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"
import {
  InMemorySessionEventStore,
  SessionEventLog
} from "../src/session-event-log.ts"
import {
  InMemoryMemoryStore,
  JsonlMemoryStore,
  MemoryService
} from "../src/memory-service.ts"

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

test("JsonlMemoryStore persists memory upserts and delete tombstones", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "myhanako-memory-"))
  const service = new MemoryService({
    store: new JsonlMemoryStore(rootDir),
    clock: () => new Date("2026-05-28T00:00:00.000Z"),
    idFactory: () => "memory_disk"
  })

  await service.createItem({
    type: "fact",
    content: "Draft disk memory.",
    sourceSessionId: "session_source",
    sourceEventIds: ["evt_source_1"],
    confidence: 0.7,
    status: "candidate",
    visibility: "normal",
    scope: {
      kind: "workspace",
      id: "workspace_a"
    },
    tags: ["disk"]
  })
  await service.updateItem("memory_disk", {
    content: "Persisted disk memory.",
    status: "active"
  })

  const restored = new MemoryService({
    store: new JsonlMemoryStore(rootDir)
  })
  assert.equal((await restored.getItem("memory_disk"))?.content, "Persisted disk memory.")
  assert.equal((await restored.listItems()).length, 1)

  await restored.deleteItem("memory_disk", "cleanup")
  const afterDelete = new MemoryService({
    store: new JsonlMemoryStore(rootDir)
  })
  assert.equal(await afterDelete.getItem("memory_disk"), null)

  const jsonl = await readFile(join(rootDir, "memories.jsonl"), "utf8")
  assert.equal(jsonl.trim().split(/\r?\n/).length, 3)
})

test("MemoryService returns source references for UI source jumps", async () => {
  const service = new MemoryService({
    store: new InMemoryMemoryStore(),
    clock: () => new Date("2026-05-28T00:00:00.000Z"),
    idFactory: () => "memory_1"
  })

  await service.createItem({
    type: "preference",
    content: "Keep Hanako-compatible architecture references.",
    sourceSessionId: "session_source",
    sourceEventIds: ["evt_source_1", "evt_source_2"],
    confidence: 0.9,
    status: "active",
    visibility: "pinned",
    scope: {
      kind: "project",
      id: "myhanako"
    },
    tags: ["architecture"]
  })

  assert.deepEqual(await service.getSourceReference("memory_1"), {
    memoryId: "memory_1",
    sessionId: "session_source",
    eventIds: ["evt_source_1", "evt_source_2"]
  })
  await assert.rejects(
    service.getSourceReference("missing_memory"),
    /Memory item not found: missing_memory/
  )
})
