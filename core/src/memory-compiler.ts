import type { PromptLayerInput } from "./prompt-assembler.ts"
import type { SessionEvent } from "../../shared/src/session-events.ts"
import type { SessionEventLog } from "./session-event-log.ts"
import type { MemoryItem } from "./memory-service.ts"

export type MemoryCompilationScope = {
  readonly projectId?: string
  readonly workspaceId?: string
  readonly sessionId?: string
}

export type CompileMemoryInput = {
  readonly items: readonly MemoryItem[]
  readonly now?: Date
  readonly scope?: MemoryCompilationScope
}

export type MemoryCompilation = {
  readonly compilationId: string
  readonly layers: readonly PromptLayerInput[]
  readonly memoryIds: readonly string[]
}

export type RecordMemoryCompilationEventInput = {
  readonly eventLog: SessionEventLog
  readonly sessionId: string
  readonly compilation: MemoryCompilation
  readonly correlationId?: string
  readonly parentEventId?: string
}

export type MemoryCompilerOptions = {
  readonly compilationIdFactory?: () => string
}

type MemoryLayerKind = "pinned" | "facts" | "today" | "week" | "longterm" | "project" | "teaching"

const LAYER_ORDER: readonly MemoryLayerKind[] = [
  "pinned",
  "facts",
  "today",
  "week",
  "longterm",
  "project",
  "teaching"
]

export class MemoryCompiler {
  readonly #compilationIdFactory: () => string

  constructor(options: MemoryCompilerOptions = {}) {
    this.#compilationIdFactory =
      options.compilationIdFactory ?? (() => `memory_compilation_${Date.now()}`)
  }

  compile(input: CompileMemoryInput): MemoryCompilation {
    const now = input.now ?? new Date()
    const grouped = new Map<MemoryLayerKind, MemoryItem[]>()

    for (const item of input.items) {
      if (!isInjectable(item, now, input.scope)) {
        continue
      }
      const layerKind = layerKindForItem(item, now)
      grouped.set(layerKind, [...(grouped.get(layerKind) ?? []), item])
    }

    const layers: PromptLayerInput[] = []
    const memoryIds: string[] = []
    for (const layerKind of LAYER_ORDER) {
      const items = (grouped.get(layerKind) ?? []).sort(compareMemoryItems)
      if (items.length === 0) {
        continue
      }
      memoryIds.push(...items.map((item) => item.id))
      layers.push({
        id: `memory:${layerKind}`,
        source: "memory",
        priority: 40 + LAYER_ORDER.indexOf(layerKind),
        enabled: true,
        editable: false,
        version: "1",
        content: renderMemoryLayer(layerKind, items)
      })
    }

    return {
      compilationId: this.#compilationIdFactory(),
      layers,
      memoryIds
    }
  }

  async recordCompilationEvent(
    input: RecordMemoryCompilationEventInput
  ): Promise<SessionEvent<"memory_compiled">> {
    return input.eventLog.append({
      sessionId: input.sessionId,
      type: "memory_compiled",
      actor: "system",
      correlationId: input.correlationId,
      parentEventId: input.parentEventId,
      payload: {
        compilationId: input.compilation.compilationId,
        layers: input.compilation.layers.map((layer) => layer.id),
        memoryIds: input.compilation.memoryIds
      }
    })
  }
}

function isInjectable(
  item: MemoryItem,
  now: Date,
  scope: MemoryCompilationScope | undefined
): boolean {
  if (item.status !== "active") {
    return false
  }
  if (item.visibility === "hidden") {
    return false
  }
  if (item.expiresAt && Date.parse(item.expiresAt) <= now.getTime()) {
    return false
  }
  return scopeMatches(item, scope)
}

function scopeMatches(item: MemoryItem, scope: MemoryCompilationScope | undefined): boolean {
  if (item.scope.kind === "global") {
    return true
  }
  if (item.scope.kind === "project") {
    return item.scope.id === scope?.projectId
  }
  if (item.scope.kind === "workspace") {
    return item.scope.id === scope?.workspaceId
  }
  return item.scope.id === scope?.sessionId
}

function layerKindForItem(item: MemoryItem, now: Date): MemoryLayerKind {
  if (item.visibility === "pinned") {
    return "pinned"
  }
  if (item.type === "project") {
    return "project"
  }
  if (item.type === "teaching") {
    return "teaching"
  }
  if (item.type === "fact" || item.type === "preference" || item.type === "skill") {
    return "facts"
  }
  const createdAt = Date.parse(item.createdAt)
  const ageMs = now.getTime() - createdAt
  if (isSameUtcDay(createdAt, now.getTime())) {
    return "today"
  }
  if (ageMs >= 0 && ageMs <= 7 * 24 * 60 * 60 * 1000) {
    return "week"
  }
  return "longterm"
}

function renderMemoryLayer(layerKind: MemoryLayerKind, items: readonly MemoryItem[]): string {
  const lines = items.map((item) => {
    const source = [item.sourceSessionId, ...item.sourceEventIds].join("#")
    return `- [${item.id}] ${item.content} (source: ${source})`
  })
  return [`Memory layer: ${layerKind}`, ...lines].join("\n")
}

function compareMemoryItems(left: MemoryItem, right: MemoryItem): number {
  const createdAtOrder = left.createdAt.localeCompare(right.createdAt)
  if (createdAtOrder !== 0) {
    return createdAtOrder
  }
  return left.id.localeCompare(right.id)
}

function isSameUtcDay(leftTime: number, rightTime: number): boolean {
  const left = new Date(leftTime)
  const right = new Date(rightTime)
  return (
    left.getUTCFullYear() === right.getUTCFullYear() &&
    left.getUTCMonth() === right.getUTCMonth() &&
    left.getUTCDate() === right.getUTCDate()
  )
}
