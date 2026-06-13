import type {
  EvidenceEnvelope,
  EvidenceJsonObject,
  EvidenceJsonValue
} from "../shared/evidence.ts"

export interface EvidenceReader {
  readAll(): Promise<readonly EvidenceEnvelope[]>
}

export type WorkflowReview = {
  readonly sessionId: string
  readonly partial: boolean
  readonly partialReasons: readonly string[]
  readonly goal: string | null
  readonly stepsAttempted: readonly string[]
  readonly toolsAndPluginsUsed: readonly string[]
  readonly contextUsed: readonly string[]
  readonly uncertaintyPoints: readonly string[]
  readonly suggestedAdjustments: readonly string[]
  readonly evidenceRefs: readonly string[]
}

export type BuildWorkflowReviewInput = {
  readonly evidenceReader: EvidenceReader
  readonly sessionId: string
}

export async function buildWorkflowReview(
  input: BuildWorkflowReviewInput
): Promise<WorkflowReview> {
  const records = (await input.evidenceReader.readAll())
    .filter((record) => record.refs.sessionPath === input.sessionId)
    .sort((left, right) => left.sequence - right.sequence)

  const stepsAttempted: string[] = []
  const toolsAndPluginsUsed: string[] = []
  const contextUsed: string[] = []
  const uncertaintyPoints: string[] = []
  const suggestedAdjustments: string[] = []
  const evidenceRefs: string[] = []
  let goal: string | null = null

  for (const record of records) {
    evidenceRefs.push(record.eventId)
    const payload = asJsonObject(record.payload)
    if (record.source.layer === "plugin") {
      pushString(toolsAndPluginsUsed, record.refs.pluginId)
    }
    switch (record.eventType) {
      case "workflow.goal.set":
        goal = firstString(payload.goal, goal)
        break
      case "workflow.step.completed":
      case "workflow.step.attempted":
        pushString(stepsAttempted, payload.step)
        break
      case "tool.used":
        pushString(toolsAndPluginsUsed, payload.tool)
        break
      case "plugin.used":
        pushString(toolsAndPluginsUsed, payload.plugin)
        break
      case "context.used":
        pushString(contextUsed, payload.context)
        break
      case "workflow.uncertainty.noted":
        pushString(uncertaintyPoints, payload.uncertainty)
        break
      case "workflow.adjustment.suggested":
        pushString(suggestedAdjustments, payload.adjustment)
        break
    }
  }

  const partialReasons: string[] = []
  if (goal === null) {
    partialReasons.push("Missing goal evidence")
  }
  if (stepsAttempted.length === 0) {
    partialReasons.push("Missing workflow step evidence")
  }

  return {
    sessionId: input.sessionId,
    partial: partialReasons.length > 0,
    partialReasons,
    goal,
    stepsAttempted,
    toolsAndPluginsUsed,
    contextUsed,
    uncertaintyPoints,
    suggestedAdjustments,
    evidenceRefs
  }
}

function asJsonObject(value: EvidenceJsonValue): EvidenceJsonObject {
  return isEvidenceJsonObject(value)
    ? value
    : {}
}

function isEvidenceJsonObject(value: EvidenceJsonValue): value is EvidenceJsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function firstString(value: EvidenceJsonValue | undefined, fallback: string | null): string | null {
  return typeof value === "string" ? value : fallback
}

function pushString(target: string[], value: EvidenceJsonValue | undefined): void {
  if (typeof value === "string" && !target.includes(value)) {
    target.push(value)
  }
}
