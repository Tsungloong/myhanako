export type SessionStreamEntry = {
  readonly streamId: string
  readonly seq: number
  readonly event: unknown
  readonly ts: number
}

export type SessionStreamState = {
  streamId: string | null
  nextSeq: number
  isStreaming: boolean
  startedAt: number
  endedAt: number
  events: SessionStreamEntry[]
  maxEvents: number
}

export type SessionStreamResume = {
  readonly streamId: string | null
  readonly sinceSeq: number
  readonly nextSeq: number
  readonly isStreaming: boolean
  readonly reset: boolean
  readonly truncated: boolean
  readonly events: readonly PublicSessionStreamEntry[]
}

export type PublicSessionStreamEntry = {
  readonly seq: number
  readonly event: unknown
  readonly ts: number
}

const defaultMaxEvents = 5000

export function createSessionStreamState(options: { readonly maxEvents?: number } = {}): SessionStreamState {
  return {
    streamId: null,
    nextSeq: 1,
    isStreaming: false,
    startedAt: 0,
    endedAt: 0,
    events: [],
    maxEvents: Math.max(1, options.maxEvents ?? defaultMaxEvents)
  }
}

export function beginSessionStream(state: SessionStreamState, streamId: string | null = null): string {
  state.streamId = streamId ?? createStreamId()
  state.nextSeq = 1
  state.isStreaming = true
  state.startedAt = Date.now()
  state.endedAt = 0
  state.events = []
  return state.streamId
}

export function appendSessionStreamEvent(state: SessionStreamState, event: unknown): SessionStreamEntry {
  if (!state.streamId) {
    beginSessionStream(state)
  }

  const entry = {
    streamId: state.streamId!,
    seq: state.nextSeq++,
    event,
    ts: Date.now()
  }
  state.events.push(entry)
  trimEvents(state)
  return entry
}

export function finishSessionStream(state: SessionStreamState): void {
  state.isStreaming = false
  state.endedAt = Date.now()
  state.events = []
}

export function resumeSessionStream(
  state: SessionStreamState,
  options: { readonly streamId?: string | null; readonly sinceSeq?: number } = {}
): SessionStreamResume {
  const requestedStreamId = options.streamId ?? state.streamId ?? null
  const currentStreamId = state.streamId ?? null
  const requestedSinceSeq = normalizeSeq(options.sinceSeq)

  if (!currentStreamId) {
    return {
      streamId: null,
      sinceSeq: requestedSinceSeq,
      nextSeq: 1,
      isStreaming: false,
      reset: false,
      truncated: false,
      events: []
    }
  }

  if (requestedStreamId && requestedStreamId !== currentStreamId) {
    return {
      streamId: currentStreamId,
      sinceSeq: 0,
      nextSeq: state.nextSeq,
      isStreaming: state.isStreaming,
      reset: true,
      truncated: false,
      events: state.events.map(toPublicEvent)
    }
  }

  const firstSeq = state.events[0]?.seq ?? state.nextSeq
  const minSinceSeq = Math.max(0, firstSeq - 1)
  const truncated = requestedSinceSeq < minSinceSeq
  const effectiveSinceSeq = truncated ? minSinceSeq : requestedSinceSeq
  return {
    streamId: currentStreamId,
    sinceSeq: effectiveSinceSeq,
    nextSeq: state.nextSeq,
    isStreaming: state.isStreaming,
    reset: false,
    truncated,
    events: state.events
      .filter((entry) => entry.seq > effectiveSinceSeq)
      .map(toPublicEvent)
  }
}

function trimEvents(state: SessionStreamState): void {
  const overflow = state.events.length - state.maxEvents
  if (overflow > 0) {
    state.events.splice(0, overflow)
  }
}

function toPublicEvent(entry: SessionStreamEntry): PublicSessionStreamEntry {
  return {
    seq: entry.seq,
    event: entry.event,
    ts: entry.ts
  }
}

function normalizeSeq(value: unknown): number {
  const numberValue = Number.isFinite(value) ? value as number : 0
  return numberValue < 0 ? 0 : Math.floor(numberValue)
}

function createStreamId(): string {
  return `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}
