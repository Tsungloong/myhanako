export type JsonPrimitive = string | number | boolean | null
export type JsonValue = JsonPrimitive | JsonObject | JsonArray
export type JsonObject = { readonly [key: string]: JsonValue }
export type JsonArray = readonly JsonValue[]

export const SESSION_EVENT_TYPES = [
  "user_message_created",
  "prompt_layers_resolved",
  "assistant_stream_started",
  "assistant_delta_received",
  "assistant_message_completed",
  "tool_call_requested",
  "tool_call_started",
  "tool_stdout_received",
  "tool_call_completed",
  "tool_call_failed",
  "file_snapshot_read",
  "file_patch_proposed",
  "file_write_committed",
  "terminal_process_started",
  "terminal_output_received",
  "terminal_process_exited",
  "memory_candidate_detected",
  "memory_item_created",
  "memory_item_updated",
  "memory_item_deleted",
  "memory_compiled",
  "memory_injected",
  "command_invoked",
  "prompt_draft_created",
  "assistant_interrupted",
  "message_recalled",
  "session_recovered",
  "tools_resolved",
  "model_request_started"
] as const

export type SessionEventType = (typeof SESSION_EVENT_TYPES)[number]

export type SessionEventActor =
  | "user"
  | "assistant"
  | "system"
  | "tool"
  | "plugin"
  | "hub"

export type PromptLayerSnapshot = {
  readonly id: string
  readonly source: string
  readonly priority: number
  readonly enabled: boolean
  readonly editable: boolean
  readonly tokenBudget?: number
  readonly version: string
  readonly checksum: string
}

export type ToolDefinitionSnapshot = {
  readonly id: string
  readonly name: string
  readonly source: string
  readonly description: string
  readonly schemaChecksum: string
  readonly permissions: readonly string[]
}

export type SessionEventPayloadMap = {
  user_message_created: {
    readonly messageId: string
    readonly content: string
    readonly attachments?: readonly JsonObject[]
  }
  prompt_layers_resolved: {
    readonly requestId: string
    readonly layers: readonly PromptLayerSnapshot[]
    readonly tokenEstimate: number
    readonly warnings: readonly string[]
  }
  assistant_stream_started: {
    readonly requestId: string
    readonly messageId: string
    readonly model: string
    readonly modelRole: "chat" | "smallTool" | "largeTool" | "vision"
  }
  assistant_delta_received: {
    readonly requestId: string
    readonly messageId: string
    readonly delta: string
    readonly sequence: number
  }
  assistant_message_completed: {
    readonly requestId: string
    readonly messageId: string
    readonly content: string
    readonly finishReason?: string
  }
  tool_call_requested: {
    readonly requestId: string
    readonly toolCallId: string
    readonly toolName: string
    readonly arguments: JsonObject
  }
  tool_call_started: {
    readonly toolCallId: string
    readonly toolName: string
  }
  tool_stdout_received: {
    readonly toolCallId: string
    readonly stream: "stdout" | "stderr"
    readonly chunk: string
    readonly sequence: number
  }
  tool_call_completed: {
    readonly toolCallId: string
    readonly result?: JsonValue
  }
  tool_call_failed: {
    readonly toolCallId: string
    readonly errorCode: string
    readonly message: string
  }
  file_snapshot_read: {
    readonly snapshotId: string
    readonly path: string
    readonly checksum: string
  }
  file_patch_proposed: {
    readonly patchId: string
    readonly snapshotId: string
    readonly path: string
    readonly oldChecksum: string
    readonly newChecksum: string
    readonly summary?: string
  }
  file_write_committed: {
    readonly patchId: string
    readonly path: string
    readonly checksum: string
  }
  terminal_process_started: {
    readonly processId: string
    readonly command: string
    readonly cwd: string
  }
  terminal_output_received: {
    readonly processId: string
    readonly stream: "stdout" | "stderr"
    readonly chunk: string
    readonly sequence: number
    readonly normalizedText: string
    readonly rawText: string
    readonly ansiMetadata?: JsonObject
  }
  terminal_process_exited: {
    readonly processId: string
    readonly exitCode: number | null
    readonly signal?: string
  }
  memory_candidate_detected: {
    readonly memoryId: string
    readonly content: string
    readonly sourceEventIds: readonly string[]
  }
  memory_item_created: {
    readonly memoryId: string
    readonly status: "candidate" | "active" | "muted" | "archived"
    readonly content: string
  }
  memory_item_updated: {
    readonly memoryId: string
    readonly changes: JsonObject
  }
  memory_item_deleted: {
    readonly memoryId: string
    readonly reason?: string
  }
  memory_compiled: {
    readonly compilationId: string
    readonly layers: readonly string[]
    readonly memoryIds: readonly string[]
  }
  memory_injected: {
    readonly requestId: string
    readonly memoryIds: readonly string[]
  }
  command_invoked: {
    readonly commandId: string
    readonly rawInput: string
    readonly arguments?: JsonObject
  }
  prompt_draft_created: {
    readonly draftId: string
    readonly source: string
  }
  assistant_interrupted: {
    readonly requestId: string
    readonly reason: string
  }
  message_recalled: {
    readonly targetMessageId: string
    readonly reason?: string
  }
  session_recovered: {
    readonly recoveredFromEventId?: string
    readonly recoveredEventCount: number
  }
  tools_resolved: {
    readonly requestId: string
    readonly tools: readonly ToolDefinitionSnapshot[]
  }
  model_request_started: {
    readonly requestId: string
    readonly model: string
    readonly modelRole: "chat" | "smallTool" | "largeTool" | "vision"
  }
}

export type SessionEventPayload<TType extends SessionEventType> =
  SessionEventPayloadMap[TType]

export type SessionEvent<TType extends SessionEventType = SessionEventType> = {
  readonly schemaVersion: 1
  readonly id: string
  readonly sessionId: string
  readonly sequence: number
  readonly type: TType
  readonly timestamp: string
  readonly actor: SessionEventActor
  readonly correlationId?: string
  readonly parentEventId?: string
  readonly payload: SessionEventPayload<TType>
}

export type AppendSessionEventInput<TType extends SessionEventType = SessionEventType> = {
  readonly sessionId: string
  readonly type: TType
  readonly actor: SessionEventActor
  readonly payload: SessionEventPayload<TType>
  readonly correlationId?: string
  readonly parentEventId?: string
}

export type SessionEventFilter = {
  readonly sessionId?: string
  readonly type?: SessionEventType
  readonly afterSequence?: number
  readonly limit?: number
}

const sessionEventTypeSet = new Set<string>(SESSION_EVENT_TYPES)

export function isSessionEventType(value: unknown): value is SessionEventType {
  return typeof value === "string" && sessionEventTypeSet.has(value)
}

export function assertSessionEventType(value: unknown): asserts value is SessionEventType {
  if (!isSessionEventType(value)) {
    throw new Error(`Unknown session event type: ${String(value)}`)
  }
}

export function compareSessionEvents(left: SessionEvent, right: SessionEvent): number {
  if (left.sessionId === right.sessionId && left.sequence !== right.sequence) {
    return left.sequence - right.sequence
  }

  const timestampOrder = left.timestamp.localeCompare(right.timestamp)
  if (timestampOrder !== 0) {
    return timestampOrder
  }

  return left.id.localeCompare(right.id)
}
