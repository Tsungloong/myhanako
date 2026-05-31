import type { DiffModel } from "./diff-service.ts"
import { DiffService } from "./diff-service.ts"
import type { SessionEvent } from "../../shared/src/session-events.ts"
import type { SessionEventLog } from "./session-event-log.ts"
import type { PatchModel } from "./workspace-service.ts"

export type FileDiffCard = {
  readonly type: "file_diff"
  readonly patchId: string
  readonly snapshotId: string
  readonly path: string
  readonly status: "proposed" | "committed"
  readonly oldChecksum: string
  readonly newChecksum: string
  readonly summary?: string
  readonly diff?: DiffModel
  readonly eventIds: readonly string[]
}

export type TerminalCard = {
  readonly type: "terminal"
  readonly processId: string
  readonly command: string
  readonly cwd: string
  readonly status: "running" | "exited"
  readonly output: readonly TerminalOutputChunk[]
  readonly exitCode: number | null
  readonly signal?: string
  readonly eventIds: readonly string[]
}

export type TerminalOutputChunk = {
  readonly stream: "stdout" | "stderr"
  readonly sequence: number
  readonly rawText: string
  readonly normalizedText: string
}

export type RuntimeTerminalEvent = {
  readonly type?: string
  readonly terminalId?: unknown
  readonly processId?: unknown
  readonly command?: unknown
  readonly cwd?: unknown
  readonly stream?: unknown
  readonly seq?: unknown
  readonly data?: unknown
  readonly text?: unknown
  readonly exitCode?: unknown
  readonly signal?: unknown
}

export type TerminalEventRecorderInput = {
  readonly eventLog: SessionEventLog
  readonly sessionId: string
  readonly event: RuntimeTerminalEvent
  readonly correlationId?: string
  readonly parentEventId?: string
}

export function createFileDiffCard(
  patch: PatchModel,
  diffService = new DiffService()
): FileDiffCard {
  return {
    type: "file_diff",
    patchId: patch.patchId,
    snapshotId: patch.snapshotId,
    path: patch.path,
    status: "proposed",
    oldChecksum: patch.oldChecksum,
    newChecksum: patch.newChecksum,
    ...(patch.summary ? { summary: patch.summary } : {}),
    diff: diffService.renderDiffModel(patch),
    eventIds: []
  }
}

export function projectFileDiffCards(
  events: readonly SessionEvent[],
  diffModels: ReadonlyMap<string, DiffModel> = new Map()
): readonly FileDiffCard[] {
  const cards = new Map<string, MutableFileDiffCard>()
  for (const event of events) {
    if (event.type === "file_patch_proposed") {
      cards.set(event.payload.patchId, {
        type: "file_diff",
        patchId: event.payload.patchId,
        snapshotId: event.payload.snapshotId,
        path: event.payload.path,
        status: "proposed",
        oldChecksum: event.payload.oldChecksum,
        newChecksum: event.payload.newChecksum,
        summary: event.payload.summary,
        diff: diffModels.get(event.payload.patchId),
        eventIds: [event.id]
      })
      continue
    }
    if (event.type === "file_write_committed") {
      const existing = cards.get(event.payload.patchId)
      if (existing) {
        existing.status = "committed"
        existing.eventIds.push(event.id)
      }
    }
  }

  return [...cards.values()].map((card) => ({
    ...card,
    eventIds: [...card.eventIds]
  }))
}

export async function recordTerminalRuntimeEvent(input: TerminalEventRecorderInput): Promise<void> {
  const processId = stringValue(input.event.processId)
    ?? stringValue(input.event.terminalId)
    ?? "terminal_unknown"
  if (input.event.type === "terminal_started") {
    await input.eventLog.append({
      sessionId: input.sessionId,
      type: "terminal_process_started",
      actor: "tool",
      correlationId: input.correlationId,
      parentEventId: input.parentEventId,
      payload: {
        processId,
        command: stringValue(input.event.command) ?? "",
        cwd: stringValue(input.event.cwd) ?? ""
      }
    })
    return
  }

  if (input.event.type === "terminal_output") {
    const rawText = stringValue(input.event.data) ?? stringValue(input.event.text) ?? ""
    await input.eventLog.append({
      sessionId: input.sessionId,
      type: "terminal_output_received",
      actor: "tool",
      correlationId: input.correlationId,
      parentEventId: input.parentEventId,
      payload: {
        processId,
        stream: input.event.stream === "stderr" ? "stderr" : "stdout",
        chunk: rawText,
        sequence: numberValue(input.event.seq) ?? 1,
        normalizedText: normalizeTerminalText(rawText),
        rawText,
        ansiMetadata: {
          hadAnsi: hasAnsi(rawText)
        }
      }
    })
    return
  }

  if (input.event.type === "terminal_exited") {
    await input.eventLog.append({
      sessionId: input.sessionId,
      type: "terminal_process_exited",
      actor: "tool",
      correlationId: input.correlationId,
      parentEventId: input.parentEventId,
      payload: {
        processId,
        exitCode: numberValue(input.event.exitCode),
        signal: stringValue(input.event.signal)
      }
    })
  }
}

export function projectTerminalCards(events: readonly SessionEvent[]): readonly TerminalCard[] {
  const cards = new Map<string, MutableTerminalCard>()
  for (const event of events) {
    if (event.type === "terminal_process_started") {
      cards.set(event.payload.processId, {
        type: "terminal",
        processId: event.payload.processId,
        command: event.payload.command,
        cwd: event.payload.cwd,
        status: "running",
        output: [],
        exitCode: null,
        eventIds: [event.id]
      })
      continue
    }

    if (event.type === "terminal_output_received") {
      const card = ensureTerminalCard(cards, event.payload.processId)
      card.output.push({
        stream: event.payload.stream,
        sequence: event.payload.sequence,
        rawText: event.payload.rawText,
        normalizedText: event.payload.normalizedText
      })
      card.eventIds.push(event.id)
      continue
    }

    if (event.type === "terminal_process_exited") {
      const card = ensureTerminalCard(cards, event.payload.processId)
      card.status = "exited"
      card.exitCode = event.payload.exitCode
      card.signal = event.payload.signal
      card.eventIds.push(event.id)
    }
  }

  return [...cards.values()].map((card) => ({
    ...card,
    output: [...card.output].sort((left, right) => left.sequence - right.sequence),
    eventIds: [...card.eventIds]
  }))
}

export function normalizeTerminalText(rawText: string): string {
  return rawText
    .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
}

type MutableFileDiffCard = Omit<FileDiffCard, "status" | "eventIds"> & {
  status: FileDiffCard["status"]
  eventIds: string[]
}

type MutableTerminalCard = Omit<TerminalCard, "status" | "output" | "exitCode" | "eventIds"> & {
  status: TerminalCard["status"]
  output: TerminalOutputChunk[]
  exitCode: number | null
  signal?: string
  eventIds: string[]
}

function ensureTerminalCard(
  cards: Map<string, MutableTerminalCard>,
  processId: string
): MutableTerminalCard {
  let card = cards.get(processId)
  if (!card) {
    card = {
      type: "terminal",
      processId,
      command: "",
      cwd: "",
      status: "running",
      output: [],
      exitCode: null,
      eventIds: []
    }
    cards.set(processId, card)
  }
  return card
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined
}

function numberValue(value: unknown): number | null {
  return Number.isFinite(value) ? value as number : null
}

function hasAnsi(value: string): boolean {
  return /\x1b\[[0-9;?]*[ -/]*[@-~]/.test(value)
}
