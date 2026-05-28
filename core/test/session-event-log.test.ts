import assert from "node:assert/strict"
import { mkdtemp, readFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"
import {
  InMemorySessionEventStore,
  JsonlSessionEventStore,
  SessionEventLog
} from "../src/session-event-log.ts"

test("SessionEventLog appends immutable events with per-session sequence numbers", async () => {
  const log = new SessionEventLog({
    store: new InMemorySessionEventStore(),
    clock: fixedClock(),
    idFactory: (event) => `evt_${event.sequence}`
  })

  const first = await log.append({
    sessionId: "session_a",
    type: "user_message_created",
    actor: "user",
    payload: {
      messageId: "msg_1",
      content: "hello"
    }
  })
  const second = await log.append({
    sessionId: "session_a",
    type: "assistant_stream_started",
    actor: "assistant",
    payload: {
      requestId: "req_1",
      messageId: "msg_2",
      model: "local-test",
      modelRole: "chat"
    }
  })

  assert.equal(first.sequence, 1)
  assert.equal(second.sequence, 2)
  assert.equal(first.id, "evt_1")
  assert.deepEqual(
    (await log.listSessionEvents("session_a")).map((event) => event.type),
    ["user_message_created", "assistant_stream_started"]
  )
})

test("SessionEventLog serializes concurrent appends for the same session", async () => {
  const log = new SessionEventLog({
    store: new InMemorySessionEventStore(),
    clock: fixedClock()
  })

  await Promise.all(
    Array.from({ length: 20 }, (_, index) =>
      log.append({
        sessionId: "session_parallel",
        type: "user_message_created",
        actor: "user",
        payload: {
          messageId: `msg_${index}`,
          content: String(index)
        }
      })
    )
  )

  const events = await log.listSessionEvents("session_parallel")
  assert.deepEqual(
    events.map((event) => event.sequence),
    Array.from({ length: 20 }, (_, index) => index + 1)
  )
})

test("JsonlSessionEventStore persists events and restores the next sequence", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "myhanako-events-"))
  const store = new JsonlSessionEventStore(rootDir)
  const firstLog = new SessionEventLog({
    store,
    clock: fixedClock()
  })

  await firstLog.append({
    sessionId: "session_disk",
    type: "user_message_created",
    actor: "user",
    payload: {
      messageId: "msg_1",
      content: "persist me"
    }
  })

  const secondLog = new SessionEventLog({
    store: new JsonlSessionEventStore(rootDir),
    clock: fixedClock()
  })

  const restoredEvent = await secondLog.append({
    sessionId: "session_disk",
    type: "message_recalled",
    actor: "user",
    payload: {
      targetMessageId: "msg_1",
      reason: "manual recall"
    }
  })

  const replay = await secondLog.replaySession("session_disk")
  assert.equal(restoredEvent.sequence, 2)
  assert.equal(replay.events.length, 2)
  assert.equal(replay.transcript[0].messageId, "msg_1")
  assert.equal(replay.transcript[0].recalled, true)

  const jsonl = await readFile(join(rootDir, "session_disk.jsonl"), "utf8")
  assert.equal(jsonl.trim().split(/\r?\n/).length, 2)
})

test("SessionEventLog rejects unknown event types at runtime boundaries", async () => {
  const log = new SessionEventLog({
    store: new InMemorySessionEventStore(),
    clock: fixedClock()
  })

  await assert.rejects(
    log.append({
      sessionId: "session_invalid",
      type: "unknown_event",
      actor: "system",
      payload: {}
    } as never),
    /Unknown session event type/
  )
})

function fixedClock(): () => Date {
  return () => new Date("2026-05-28T00:00:00.000Z")
}
