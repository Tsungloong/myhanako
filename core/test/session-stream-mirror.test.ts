import assert from "node:assert/strict"
import test from "node:test"
import {
  InMemorySessionEventStore,
  SessionEventLog
} from "../src/session-event-log.ts"
import { RuntimeStreamMirror } from "../src/session-stream-mirror.ts"

test("RuntimeStreamMirror mirrors assistant text deltas into append-only session events", async () => {
  const log = createEventLog()
  const mirror = new RuntimeStreamMirror({
    eventLog: log,
    requestIdFactory: () => "req_1",
    messageIdFactory: () => "assistant_1"
  })

  await mirror.mirror("session_1", {
    type: "message_update",
    model: "openai/gpt-4.1",
    assistantMessageEvent: {
      type: "text_delta",
      delta: "hel"
    }
  })
  await mirror.mirror("session_1", {
    type: "message_update",
    assistantMessageEvent: {
      type: "text_delta",
      delta: "lo"
    }
  })
  await mirror.mirror("session_1", { type: "turn_end" })

  const events = await log.listSessionEvents("session_1")
  assert.deepEqual(events.map((event) => event.type), [
    "assistant_stream_started",
    "assistant_delta_received",
    "assistant_delta_received",
    "assistant_message_completed"
  ])
  assert.deepEqual(events[0].payload, {
    requestId: "req_1",
    messageId: "assistant_1",
    model: "openai/gpt-4.1",
    modelRole: "chat"
  })
  assert.deepEqual(events[1].payload, {
    requestId: "req_1",
    messageId: "assistant_1",
    delta: "hel",
    sequence: 1
  })
  assert.equal(events[3].payload.content, "hello")
})

test("RuntimeStreamMirror mirrors tool execution lifecycle without treating tools as runtime truth", async () => {
  const log = createEventLog()
  const mirror = new RuntimeStreamMirror({
    eventLog: log,
    requestIdFactory: () => "req_tools",
    messageIdFactory: () => "assistant_tools",
    toolCallIdFactory: () => "tool_call_1"
  })

  await mirror.mirror("session_tools", {
    type: "tool_execution_start",
    toolName: "workspace_read",
    args: {
      path: "README.md"
    }
  })
  await mirror.mirror("session_tools", {
    type: "tool_execution_end",
    toolName: "workspace_read",
    result: {
      details: {
        ok: true
      }
    }
  })

  const events = await log.listSessionEvents("session_tools")
  assert.deepEqual(events.map((event) => event.type), [
    "assistant_stream_started",
    "tool_call_requested",
    "tool_call_started",
    "tool_call_completed"
  ])
  assert.deepEqual(events[1].payload, {
    requestId: "req_tools",
    toolCallId: "tool_call_1",
    toolName: "workspace_read",
    arguments: {
      path: "README.md"
    }
  })
  assert.deepEqual(events[3].payload, {
    toolCallId: "tool_call_1",
    result: {
      ok: true
    }
  })
})

function createEventLog(): SessionEventLog {
  return new SessionEventLog({
    store: new InMemorySessionEventStore(),
    clock: () => new Date("2026-05-31T00:00:00.000Z"),
    idFactory: (event) => `evt_${event.sequence}`
  })
}
