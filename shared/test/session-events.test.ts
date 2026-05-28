import assert from "node:assert/strict"
import test from "node:test"
import {
  SESSION_EVENT_TYPES,
  isSessionEventType,
  type SessionEvent
} from "../src/session-events.ts"
import { projectSessionTranscript } from "../src/session-projection.ts"

test("session event contract includes the P0 audited fact-source events", () => {
  assert.ok(SESSION_EVENT_TYPES.includes("user_message_created"))
  assert.ok(SESSION_EVENT_TYPES.includes("prompt_layers_resolved"))
  assert.ok(SESSION_EVENT_TYPES.includes("memory_injected"))
  assert.ok(SESSION_EVENT_TYPES.includes("file_patch_proposed"))
  assert.ok(SESSION_EVENT_TYPES.includes("terminal_output_received"))
  assert.ok(SESSION_EVENT_TYPES.includes("message_recalled"))
  assert.equal(isSessionEventType("unknown_event"), false)
})

test("projectSessionTranscript builds chat state without deleting recalled source events", () => {
  const events: SessionEvent[] = [
    {
      schemaVersion: 1,
      id: "evt_1",
      sessionId: "session_1",
      sequence: 1,
      type: "user_message_created",
      timestamp: "2026-05-28T00:00:00.000Z",
      actor: "user",
      payload: {
        messageId: "msg_user_1",
        content: "开始"
      }
    },
    {
      schemaVersion: 1,
      id: "evt_2",
      sessionId: "session_1",
      sequence: 2,
      type: "assistant_stream_started",
      timestamp: "2026-05-28T00:00:01.000Z",
      actor: "assistant",
      payload: {
        requestId: "req_1",
        messageId: "msg_assistant_1",
        model: "local-test",
        modelRole: "chat"
      }
    },
    {
      schemaVersion: 1,
      id: "evt_3",
      sessionId: "session_1",
      sequence: 3,
      type: "assistant_delta_received",
      timestamp: "2026-05-28T00:00:02.000Z",
      actor: "assistant",
      payload: {
        requestId: "req_1",
        messageId: "msg_assistant_1",
        delta: "收到",
        sequence: 1
      }
    },
    {
      schemaVersion: 1,
      id: "evt_4",
      sessionId: "session_1",
      sequence: 4,
      type: "assistant_message_completed",
      timestamp: "2026-05-28T00:00:03.000Z",
      actor: "assistant",
      payload: {
        requestId: "req_1",
        messageId: "msg_assistant_1",
        content: "收到",
        finishReason: "stop"
      }
    },
    {
      schemaVersion: 1,
      id: "evt_5",
      sessionId: "session_1",
      sequence: 5,
      type: "message_recalled",
      timestamp: "2026-05-28T00:00:04.000Z",
      actor: "user",
      payload: {
        targetMessageId: "msg_user_1"
      }
    }
  ]

  const transcript = projectSessionTranscript(events)

  assert.equal(transcript.length, 2)
  assert.deepEqual(transcript.map((message) => message.messageId), [
    "msg_user_1",
    "msg_assistant_1"
  ])
  assert.equal(transcript[0].recalled, true)
  assert.equal(transcript[0].content, "开始")
  assert.equal(transcript[1].content, "收到")
})
