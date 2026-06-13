import { randomUUID } from "node:crypto"
import { appendFile, mkdir, readdir, readFile } from "node:fs/promises"
import { basename, join } from "node:path"
import {
  assertSessionEventType,
  compareSessionEvents,
  type AppendSessionEventInput,
  type SessionEvent,
  type SessionEventFilter
} from "../../shared/src/session-events.ts"
import {
  projectSessionTranscript,
  type TranscriptMessage
} from "../../shared/src/session-projection.ts"

export type SessionReplay = {
  readonly sessionId: string
  readonly events: readonly SessionEvent[]
  readonly transcript: readonly TranscriptMessage[]
}

export interface SessionEventStore {
  append(event: SessionEvent): Promise<void>
  list(filter?: SessionEventFilter): Promise<readonly SessionEvent[]>
}

export type SessionEventLogOptions = {
  readonly store: SessionEventStore
  readonly clock?: () => Date
  readonly idFactory?: (event: Omit<SessionEvent, "id">) => string
}

export class SessionEventLog {
  readonly #store: SessionEventStore
  readonly #clock: () => Date
  readonly #idFactory: (event: Omit<SessionEvent, "id">) => string
  readonly #nextSequences = new Map<string, number>()
  readonly #sequenceInitialization = new Map<string, Promise<void>>()
  readonly #appendQueues = new Map<string, Promise<unknown>>()

  constructor(options: SessionEventLogOptions) {
    this.#store = options.store
    this.#clock = options.clock ?? (() => new Date())
    this.#idFactory =
      options.idFactory ??
      ((event) => `evt_${event.sessionId}_${event.sequence}_${randomUUID()}`)
  }

  append<TType extends AppendSessionEventInput["type"]>(
    input: AppendSessionEventInput<TType>
  ): Promise<SessionEvent<TType>> {
    const previousAppend = this.#appendQueues.get(input.sessionId) ?? Promise.resolve()
    const nextAppend = previousAppend.then(() => this.#appendUnlocked(input))
    this.#appendQueues.set(input.sessionId, nextAppend.catch(() => undefined))
    return nextAppend
  }

  async list(filter: SessionEventFilter = {}): Promise<readonly SessionEvent[]> {
    const events = await this.#store.list(filter)
    return applySessionEventFilter(events, filter)
  }

  async listSessionEvents(sessionId: string): Promise<readonly SessionEvent[]> {
    return this.list({ sessionId })
  }

  async replaySession(sessionId: string): Promise<SessionReplay> {
    const events = await this.listSessionEvents(sessionId)
    return {
      sessionId,
      events,
      transcript: projectSessionTranscript(events)
    }
  }

  async #appendUnlocked<TType extends AppendSessionEventInput["type"]>(
    input: AppendSessionEventInput<TType>
  ): Promise<SessionEvent<TType>> {
    assertSessionEventType(input.type)
    await this.#ensureSequenceLoaded(input.sessionId)

    const sequence = this.#nextSequences.get(input.sessionId) ?? 1
    const eventWithoutId = {
      schemaVersion: 1,
      sessionId: input.sessionId,
      sequence,
      type: input.type,
      timestamp: this.#clock().toISOString(),
      actor: input.actor,
      correlationId: input.correlationId,
      parentEventId: input.parentEventId,
      payload: input.payload
    } as Omit<SessionEvent<TType>, "id">
    const event = {
      ...eventWithoutId,
      id: this.#idFactory(eventWithoutId)
    } as SessionEvent<TType>

    await this.#store.append(event as SessionEvent)
    this.#nextSequences.set(input.sessionId, sequence + 1)
    return event
  }

  async #ensureSequenceLoaded(sessionId: string): Promise<void> {
    let initialization = this.#sequenceInitialization.get(sessionId)
    if (!initialization) {
      initialization = this.#loadNextSequence(sessionId)
      this.#sequenceInitialization.set(sessionId, initialization)
    }

    await initialization
  }

  async #loadNextSequence(sessionId: string): Promise<void> {
    const existingEvents = await this.#store.list({ sessionId })
    const maxSequence = existingEvents.reduce(
      (max, event) => Math.max(max, event.sequence),
      0
    )
    this.#nextSequences.set(sessionId, maxSequence + 1)
  }
}

export class InMemorySessionEventStore implements SessionEventStore {
  readonly #events: SessionEvent[] = []

  async append(event: SessionEvent): Promise<void> {
    this.#events.push(structuredClone(event))
  }

  async list(filter: SessionEventFilter = {}): Promise<readonly SessionEvent[]> {
    return applySessionEventFilter(this.#events, filter).map((event) => structuredClone(event))
  }
}

export class JsonlSessionEventStore implements SessionEventStore {
  readonly #rootDir: string

  constructor(rootDir: string) {
    this.#rootDir = rootDir
  }

  async append(event: SessionEvent): Promise<void> {
    await mkdir(this.#rootDir, { recursive: true })
    await appendFile(this.#sessionFilePath(event.sessionId), `${JSON.stringify(event)}\n`, "utf8")
  }

  async list(filter: SessionEventFilter = {}): Promise<readonly SessionEvent[]> {
    if (filter.sessionId) {
      return applySessionEventFilter(await this.#readSessionFile(filter.sessionId), filter)
    }

    let entries: string[]
    try {
      entries = await readdir(this.#rootDir)
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") {
        return []
      }
      throw error
    }

    const allEvents: SessionEvent[] = []
    for (const entry of entries) {
      if (!entry.endsWith(".jsonl")) {
        continue
      }
      const encodedSessionId = basename(entry, ".jsonl")
      allEvents.push(...(await this.#readSessionFile(decodeURIComponent(encodedSessionId))))
    }

    return applySessionEventFilter(allEvents, filter)
  }

  async #readSessionFile(sessionId: string): Promise<readonly SessionEvent[]> {
    let content: string
    try {
      content = await readFile(this.#sessionFilePath(sessionId), "utf8")
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") {
        return []
      }
      throw error
    }

    return content
      .split(/\r?\n/)
      .filter((line) => line.trim().length > 0)
      .map((line) => parseSessionEventLine(line))
  }

  #sessionFilePath(sessionId: string): string {
    return join(this.#rootDir, `${encodeURIComponent(sessionId)}.jsonl`)
  }
}

export function applySessionEventFilter(
  events: readonly SessionEvent[],
  filter: SessionEventFilter = {}
): readonly SessionEvent[] {
  let filteredEvents = [...events]

  if (filter.sessionId) {
    filteredEvents = filteredEvents.filter((event) => event.sessionId === filter.sessionId)
  }

  if (filter.type) {
    filteredEvents = filteredEvents.filter((event) => event.type === filter.type)
  }

  if (filter.afterSequence !== undefined) {
    filteredEvents = filteredEvents.filter((event) => event.sequence > filter.afterSequence!)
  }

  filteredEvents.sort(compareSessionEvents)

  if (filter.limit !== undefined) {
    return filteredEvents.slice(0, filter.limit)
  }

  return filteredEvents
}

function parseSessionEventLine(line: string): SessionEvent {
  const event = JSON.parse(line) as SessionEvent
  assertSessionEventType(event.type)
  return event
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error
}
