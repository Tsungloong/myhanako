import type { SessionEvent } from "../../shared/src/session-events.ts"
import {
  projectSessionTranscript,
  type TranscriptMessage
} from "../../shared/src/session-projection.ts"
import {
  projectFileDiffCards,
  projectTerminalCards
} from "./enhancement-projection.ts"

export type SessionInspectorEventLog = {
  readonly listSessionEvents?: (sessionId: string) => Promise<readonly SessionEvent[]>
  readonly list?: (filter?: { readonly sessionId?: string }) => Promise<readonly SessionEvent[]>
}

export type SessionInspectorSnapshot = {
  readonly sessionId: string
  readonly events: readonly SessionEvent[]
  readonly transcript: readonly TranscriptMessage[]
  readonly runtime?: unknown
  readonly promptLayers: readonly PromptTransparencySnapshot[]
  readonly tools: readonly ToolTransparencySnapshot[]
  readonly modelRequests: readonly ModelRequestSnapshot[]
  readonly fileDiffCards: readonly unknown[]
  readonly terminalCards: readonly unknown[]
  readonly memory: readonly unknown[]
}

export type PromptTransparencySnapshot = {
  readonly requestId: string
  readonly layers: SessionEvent<"prompt_layers_resolved">["payload"]["layers"]
  readonly tokenEstimate: number
  readonly warnings: readonly string[]
  readonly eventId: string
}

export type ToolTransparencySnapshot = {
  readonly requestId: string
  readonly tools: SessionEvent<"tools_resolved">["payload"]["tools"]
  readonly eventId: string
}

export type ModelRequestSnapshot = {
  readonly requestId: string
  readonly model: string
  readonly modelRole: SessionEvent<"model_request_started">["payload"]["modelRole"]
  readonly eventId: string
}

export type MemoryTransparencyEntry =
  | {
      readonly type: "memory_item"
      readonly memoryId: string
      readonly status?: string
      readonly content?: string
      readonly deleted: boolean
      readonly eventIds: readonly string[]
    }
  | {
      readonly type: "memory_compilation"
      readonly compilationId: string
      readonly layers: readonly string[]
      readonly memoryIds: readonly string[]
      readonly eventId: string
    }
  | {
      readonly type: "memory_injection"
      readonly requestId: string
      readonly memoryIds: readonly string[]
      readonly eventId: string
    }

export type SessionInspectorOptions = {
  readonly eventLog: SessionInspectorEventLog
  readonly runtimeSnapshot?: () => unknown
  readonly fileDiffCards?: (sessionId: string, events: readonly SessionEvent[]) => readonly unknown[] | Promise<readonly unknown[]>
  readonly terminalCards?: (sessionId: string, events: readonly SessionEvent[]) => readonly unknown[] | Promise<readonly unknown[]>
  readonly memorySnapshot?: (sessionId: string, events: readonly SessionEvent[]) => readonly unknown[] | Promise<readonly unknown[]>
}

export class SessionInspector {
  readonly #options: SessionInspectorOptions

  constructor(options: SessionInspectorOptions) {
    this.#options = options
  }

  async getSessionSnapshot(sessionId: string): Promise<SessionInspectorSnapshot> {
    const events = await this.#listSessionEvents(sessionId)
    return {
      sessionId,
      events,
      transcript: projectSessionTranscript(events),
      runtime: this.#options.runtimeSnapshot?.(),
      promptLayers: projectPromptTransparency(events),
      tools: projectToolTransparency(events),
      modelRequests: projectModelRequests(events),
      fileDiffCards: [...(await this.#resolveFileDiffCards(sessionId, events))],
      terminalCards: [...(await this.#resolveTerminalCards(sessionId, events))],
      memory: [...(await this.#resolveMemorySnapshot(sessionId, events))]
    }
  }

  async #listSessionEvents(sessionId: string): Promise<readonly SessionEvent[]> {
    if (this.#options.eventLog.listSessionEvents) {
      return this.#options.eventLog.listSessionEvents(sessionId)
    }
    if (this.#options.eventLog.list) {
      return this.#options.eventLog.list({ sessionId })
    }
    return []
  }

  async #resolveFileDiffCards(sessionId: string, events: readonly SessionEvent[]): Promise<readonly unknown[]> {
    return this.#options.fileDiffCards
      ? this.#options.fileDiffCards(sessionId, events)
      : projectFileDiffCards(events)
  }

  async #resolveTerminalCards(sessionId: string, events: readonly SessionEvent[]): Promise<readonly unknown[]> {
    return this.#options.terminalCards
      ? this.#options.terminalCards(sessionId, events)
      : projectTerminalCards(events)
  }

  async #resolveMemorySnapshot(sessionId: string, events: readonly SessionEvent[]): Promise<readonly unknown[]> {
    return this.#options.memorySnapshot
      ? this.#options.memorySnapshot(sessionId, events)
      : projectMemoryTransparency(events)
  }
}

export function projectPromptTransparency(events: readonly SessionEvent[]): readonly PromptTransparencySnapshot[] {
  return events
    .filter((event): event is SessionEvent<"prompt_layers_resolved"> => event.type === "prompt_layers_resolved")
    .map((event) => ({
      requestId: event.payload.requestId,
      layers: event.payload.layers,
      tokenEstimate: event.payload.tokenEstimate,
      warnings: event.payload.warnings,
      eventId: event.id
    }))
}

export function projectToolTransparency(events: readonly SessionEvent[]): readonly ToolTransparencySnapshot[] {
  return events
    .filter((event): event is SessionEvent<"tools_resolved"> => event.type === "tools_resolved")
    .map((event) => ({
      requestId: event.payload.requestId,
      tools: event.payload.tools,
      eventId: event.id
    }))
}

export function projectModelRequests(events: readonly SessionEvent[]): readonly ModelRequestSnapshot[] {
  return events
    .filter((event): event is SessionEvent<"model_request_started"> => event.type === "model_request_started")
    .map((event) => ({
      requestId: event.payload.requestId,
      model: event.payload.model,
      modelRole: event.payload.modelRole,
      eventId: event.id
    }))
}

export function projectMemoryTransparency(events: readonly SessionEvent[]): readonly MemoryTransparencyEntry[] {
  const items = new Map<string, {
    memoryId: string
    status?: string
    content?: string
    deleted: boolean
    eventIds: string[]
  }>()
  const timeline: MemoryTransparencyEntry[] = []

  for (const event of events) {
    if (event.type === "memory_item_created") {
      items.set(event.payload.memoryId, {
        memoryId: event.payload.memoryId,
        status: event.payload.status,
        content: event.payload.content,
        deleted: false,
        eventIds: [event.id]
      })
      continue
    }

    if (event.type === "memory_item_updated") {
      const item = items.get(event.payload.memoryId) ?? {
        memoryId: event.payload.memoryId,
        deleted: false,
        eventIds: []
      }
      const status = typeof event.payload.changes.status === "string"
        ? event.payload.changes.status
        : item.status
      const content = typeof event.payload.changes.content === "string"
        ? event.payload.changes.content
        : item.content
      item.status = status
      item.content = content
      item.eventIds.push(event.id)
      items.set(event.payload.memoryId, item)
      continue
    }

    if (event.type === "memory_item_deleted") {
      const item = items.get(event.payload.memoryId) ?? {
        memoryId: event.payload.memoryId,
        deleted: false,
        eventIds: []
      }
      item.deleted = true
      item.eventIds.push(event.id)
      items.set(event.payload.memoryId, item)
      continue
    }

    if (event.type === "memory_compiled") {
      timeline.push({
        type: "memory_compilation",
        compilationId: event.payload.compilationId,
        layers: event.payload.layers,
        memoryIds: event.payload.memoryIds,
        eventId: event.id
      })
      continue
    }

    if (event.type === "memory_injected") {
      timeline.push({
        type: "memory_injection",
        requestId: event.payload.requestId,
        memoryIds: event.payload.memoryIds,
        eventId: event.id
      })
    }
  }

  return [
    ...[...items.values()].map((item) => ({
      type: "memory_item" as const,
      memoryId: item.memoryId,
      status: item.status,
      content: item.content,
      deleted: item.deleted,
      eventIds: [...item.eventIds]
    })),
    ...timeline
  ]
}
