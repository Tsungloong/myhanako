import { randomUUID } from "node:crypto"
import { appendFile, mkdir, readFile } from "node:fs/promises"
import { join } from "node:path"
import type { JsonObject } from "../../shared/src/session-events.ts"
import type { SessionEventLog } from "./session-event-log.ts"

export type MemoryType =
  | "fact"
  | "preference"
  | "project"
  | "skill"
  | "teaching"
  | "temporary"

export type MemoryStatus = "candidate" | "active" | "muted" | "archived"
export type MemoryVisibility = "normal" | "pinned" | "hidden"

export type MemoryScope =
  | {
      readonly kind: "global"
    }
  | {
      readonly kind: "project" | "workspace" | "session"
      readonly id: string
    }

export type MemorySourceReference = {
  readonly memoryId: string
  readonly sessionId: string
  readonly eventIds: readonly string[]
}

export type MemoryItem = {
  readonly id: string
  readonly type: MemoryType
  readonly content: string
  readonly sourceSessionId: string
  readonly sourceEventIds: readonly string[]
  readonly confidence: number
  readonly status: MemoryStatus
  readonly visibility: MemoryVisibility
  readonly scope: MemoryScope
  readonly createdAt: string
  readonly updatedAt: string
  readonly lastInjectedAt?: string
  readonly expiresAt?: string
  readonly tags: readonly string[]
}

export type CreateMemoryItemInput = Omit<MemoryItem, "id" | "createdAt" | "updatedAt"> & {
  readonly id?: string
  readonly createdAt?: string
  readonly updatedAt?: string
}

export type UpdateMemoryItemInput = Partial<
  Pick<
    MemoryItem,
    | "type"
    | "content"
    | "sourceSessionId"
    | "sourceEventIds"
    | "confidence"
    | "status"
    | "visibility"
    | "scope"
    | "lastInjectedAt"
    | "expiresAt"
    | "tags"
  >
>

export type MemoryAuditContext = {
  readonly sessionId: string
  readonly eventLog: SessionEventLog
  readonly correlationId?: string
  readonly parentEventId?: string
}

export type MemoryStore = {
  get(id: string): Promise<MemoryItem | null>
  put(item: MemoryItem): Promise<void>
  delete(id: string): Promise<boolean>
  list(): Promise<readonly MemoryItem[]>
}

export type MemoryServiceOptions = {
  readonly store: MemoryStore
  readonly clock?: () => Date
  readonly idFactory?: () => string
}

export class InMemoryMemoryStore implements MemoryStore {
  readonly #items = new Map<string, MemoryItem>()

  async get(id: string): Promise<MemoryItem | null> {
    const item = this.#items.get(id)
    return item ? cloneMemoryItem(item) : null
  }

  async put(item: MemoryItem): Promise<void> {
    this.#items.set(item.id, cloneMemoryItem(item))
  }

  async delete(id: string): Promise<boolean> {
    return this.#items.delete(id)
  }

  async list(): Promise<readonly MemoryItem[]> {
    return Array.from(this.#items.values())
      .map(cloneMemoryItem)
      .sort((left, right) => left.id.localeCompare(right.id))
  }
}

type JsonlMemoryRecord =
  | {
      readonly op: "put"
      readonly item: MemoryItem
    }
  | {
      readonly op: "delete"
      readonly id: string
    }

export class JsonlMemoryStore implements MemoryStore {
  readonly #rootDir: string

  constructor(rootDir: string) {
    this.#rootDir = rootDir
  }

  async get(id: string): Promise<MemoryItem | null> {
    const items = await this.#loadItems()
    const item = items.get(id)
    return item ? cloneMemoryItem(item) : null
  }

  async put(item: MemoryItem): Promise<void> {
    await this.#append({
      op: "put",
      item: cloneMemoryItem(item)
    })
  }

  async delete(id: string): Promise<boolean> {
    const items = await this.#loadItems()
    if (!items.has(id)) {
      return false
    }

    await this.#append({
      op: "delete",
      id
    })
    return true
  }

  async list(): Promise<readonly MemoryItem[]> {
    return Array.from((await this.#loadItems()).values())
      .map(cloneMemoryItem)
      .sort((left, right) => left.id.localeCompare(right.id))
  }

  async #append(record: JsonlMemoryRecord): Promise<void> {
    await mkdir(this.#rootDir, { recursive: true })
    await appendFile(this.#filePath(), `${JSON.stringify(record)}\n`, "utf8")
  }

  async #loadItems(): Promise<Map<string, MemoryItem>> {
    let content: string
    try {
      content = await readFile(this.#filePath(), "utf8")
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") {
        return new Map()
      }
      throw error
    }

    const items = new Map<string, MemoryItem>()
    for (const line of content.split(/\r?\n/)) {
      if (line.trim().length === 0) {
        continue
      }

      const record = JSON.parse(line) as JsonlMemoryRecord
      if (record.op === "put") {
        const item = cloneMemoryItem(record.item)
        items.set(item.id, item)
      } else if (record.op === "delete") {
        items.delete(record.id)
      } else {
        throw new Error("Unknown memory JSONL record operation")
      }
    }
    return items
  }

  #filePath(): string {
    return join(this.#rootDir, "memories.jsonl")
  }
}

export class MemoryService {
  readonly #store: MemoryStore
  readonly #clock: () => Date
  readonly #idFactory: () => string

  constructor(options: MemoryServiceOptions) {
    this.#store = options.store
    this.#clock = options.clock ?? (() => new Date())
    this.#idFactory = options.idFactory ?? (() => `memory_${randomUUID()}`)
  }

  async createItem(
    input: CreateMemoryItemInput,
    audit?: MemoryAuditContext
  ): Promise<MemoryItem> {
    const now = this.#clock().toISOString()
    const item = normalizeMemoryItem({
      ...input,
      id: input.id ?? this.#idFactory(),
      sourceEventIds: [...input.sourceEventIds],
      tags: [...input.tags],
      createdAt: input.createdAt ?? now,
      updatedAt: input.updatedAt ?? input.createdAt ?? now
    })

    await this.#store.put(item)
    if (audit) {
      await audit.eventLog.append({
        sessionId: audit.sessionId,
        type: "memory_item_created",
        actor: "system",
        correlationId: audit.correlationId,
        parentEventId: audit.parentEventId,
        payload: {
          memoryId: item.id,
          status: item.status,
          content: item.content
        }
      })
    }
    return cloneMemoryItem(item)
  }

  async updateItem(
    id: string,
    changes: UpdateMemoryItemInput,
    audit?: MemoryAuditContext
  ): Promise<MemoryItem> {
    const existing = await this.#store.get(id)
    if (!existing) {
      throw new Error(`Memory item not found: ${id}`)
    }

    const updated = normalizeMemoryItem({
      ...existing,
      ...changes,
      sourceEventIds: changes.sourceEventIds
        ? [...changes.sourceEventIds]
        : [...existing.sourceEventIds],
      tags: changes.tags ? [...changes.tags] : [...existing.tags],
      updatedAt: this.#clock().toISOString()
    })
    await this.#store.put(updated)

    if (audit) {
      await audit.eventLog.append({
        sessionId: audit.sessionId,
        type: "memory_item_updated",
        actor: "system",
        correlationId: audit.correlationId,
        parentEventId: audit.parentEventId,
        payload: {
          memoryId: id,
          changes: toJsonObject(changes)
        }
      })
    }

    return cloneMemoryItem(updated)
  }

  async deleteItem(
    id: string,
    reason?: string,
    audit?: MemoryAuditContext
  ): Promise<boolean> {
    const deleted = await this.#store.delete(id)
    if (!deleted) {
      return false
    }

    if (audit) {
      await audit.eventLog.append({
        sessionId: audit.sessionId,
        type: "memory_item_deleted",
        actor: "system",
        correlationId: audit.correlationId,
        parentEventId: audit.parentEventId,
        payload: {
          memoryId: id,
          ...(reason ? { reason } : {})
        }
      })
    }
    return true
  }

  async getItem(id: string): Promise<MemoryItem | null> {
    const item = await this.#store.get(id)
    return item ? cloneMemoryItem(item) : null
  }

  async getSourceReference(id: string): Promise<MemorySourceReference> {
    const item = await this.getItem(id)
    if (!item) {
      throw new Error(`Memory item not found: ${id}`)
    }

    return {
      memoryId: item.id,
      sessionId: item.sourceSessionId,
      eventIds: [...item.sourceEventIds]
    }
  }

  async listItems(): Promise<readonly MemoryItem[]> {
    return this.#store.list()
  }
}

function cloneMemoryItem(item: MemoryItem): MemoryItem {
  return normalizeMemoryItem({
    ...item,
    sourceEventIds: [...item.sourceEventIds],
    tags: [...item.tags]
  })
}

function normalizeMemoryItem(item: MemoryItem): MemoryItem {
  return Object.fromEntries(
    Object.entries(item).filter(([, value]) => value !== undefined)
  ) as MemoryItem
}

function toJsonObject(value: UpdateMemoryItemInput): JsonObject {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined)
  ) as JsonObject
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error
}
