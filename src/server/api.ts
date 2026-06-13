import {
  validateEvidenceEnvelope,
  type EvidenceEnvelope
} from "../shared/evidence.ts"
import {
  buildWorkflowReview,
  type EvidenceReader,
  type WorkflowReview
} from "../core/workflow-review.ts"
import {
  buildEvidenceBundle,
  type EvidenceBundle
} from "../core/evidence-bundle.ts"
import type {
  StoreCreateWorkflowAdjustmentDraftInput,
  WorkflowAdjustmentDraft,
  WorkflowAdjustmentRepository
} from "../core/workflow-adjustments.ts"

export interface EvidenceSink {
  append(record: EvidenceEnvelope): Promise<void>
}

export type SidecarRequest = {
  readonly method: string
  readonly path: string
  readonly body: unknown
}

export type SidecarResponse =
  | {
      readonly status: 200
      readonly json: EvidenceIngestResponse
    }
  | {
      readonly status: 400
      readonly json: EvidenceIngestResponse
    }
  | {
      readonly status: 400
      readonly json: {
        readonly error: string
      }
    }
  | {
      readonly status: 404
      readonly json: {
        readonly error: string
      }
    }
  | {
      readonly status: 200
      readonly json: WorkflowReview
    }
  | {
      readonly status: 200
      readonly json: PluginLabStatus
    }
  | {
      readonly status: 200
      readonly json: PluginLabActionResult
    }
  | {
      readonly status: 200
      readonly json: WorkflowAdjustmentDraft
    }
  | {
      readonly status: 200
      readonly json: EvidenceBundle
    }

export type EvidenceIngestResponse = {
  readonly accepted: number
  readonly rejected: number
  readonly errors: readonly EvidenceIngestError[]
}

export type EvidenceIngestError = {
  readonly index: number | null
  readonly message: string
}

export type PluginLabStatus =
  | {
      readonly status: "available"
      readonly evidenceEventId: string
    }
  | {
      readonly status: "unavailable" | "degraded"
      readonly reason: string
      readonly evidenceEventId?: string
    }

export interface PluginLabReader {
  readStatus(pluginId: string): Promise<PluginLabStatus>
  runAction?(input: PluginLabActionRequest): Promise<PluginLabActionResult>
}

export type PluginLabActionRequest = {
  readonly action: string
  readonly labMode?: boolean
  readonly input?: Record<string, unknown>
}

export type PluginLabActionResult =
  | {
      readonly status: "completed"
      readonly actionId: string
      readonly evidenceEventId: string
      readonly capability: string
      readonly result: unknown
    }
  | {
      readonly status: "unavailable" | "degraded" | "denied"
      readonly actionId: string
      readonly evidenceEventId: string
      readonly capability?: string
      readonly reason: string
    }

export type SidecarApiOptions = {
  readonly evidenceSink: EvidenceSink
  readonly evidenceReader?: EvidenceReader
  readonly pluginLab?: PluginLabReader
  readonly workflowAdjustments?: WorkflowAdjustmentRepository
}

export async function handleSidecarRequest(
  request: SidecarRequest,
  options: SidecarApiOptions
): Promise<SidecarResponse> {
  if (isMalformedWorkflowReviewPath(request.method, request.path)) {
    return {
      status: 400,
      json: {
        accepted: 0,
        rejected: 0,
        errors: [
          {
            index: null,
            message: "Invalid workflow review session id"
          }
        ]
      }
    }
  }

  const workflowReviewSessionId = matchWorkflowReviewPath(request.method, request.path)
  if (workflowReviewSessionId !== null) {
    if (!options.evidenceReader) {
      return {
        status: 400,
        json: {
          accepted: 0,
          rejected: 0,
          errors: [
            {
              index: null,
              message: "Evidence reader unavailable"
            }
          ]
        }
      }
    }
    return {
      status: 200,
      json: await buildWorkflowReview({
        evidenceReader: options.evidenceReader,
        sessionId: workflowReviewSessionId
      })
    }
  }

  if (isMalformedPluginLabPath(request.method, request.path)) {
    return {
      status: 400,
      json: {
        error: "Invalid plugin lab plugin id"
      }
    }
  }

  const pluginLabPluginId = matchPluginLabPath(request.method, request.path)
  if (pluginLabPluginId !== null) {
    if (!options.pluginLab) {
      return {
        status: 400,
        json: {
          error: "Plugin lab unavailable"
        }
      }
    }
    return {
      status: 200,
      json: await options.pluginLab.readStatus(pluginLabPluginId)
    }
  }

  if (request.method === "POST" && request.path === "/v1/lab/actions") {
    if (!options.pluginLab?.runAction) {
      return {
        status: 400,
        json: {
          error: "Plugin lab actions unavailable"
        }
      }
    }
    const actionRequest = parsePluginLabActionRequest(request.body)
    if (!actionRequest) {
      return {
        status: 400,
        json: {
          error: "Invalid plugin lab action request body"
        }
      }
    }
    return {
      status: 200,
      json: await options.pluginLab.runAction(actionRequest)
    }
  }

  if (request.method === "POST" && request.path === "/v1/workflow-adjustments/draft") {
    if (!options.workflowAdjustments) {
      return {
        status: 400,
        json: {
          error: "Workflow adjustment store unavailable"
        }
      }
    }
    const input = parseWorkflowAdjustmentDraftRequest(request.body)
    if (!input) {
      return {
        status: 400,
        json: {
          error: "Invalid workflow adjustment draft request body"
        }
      }
    }
    return {
      status: 200,
      json: await options.workflowAdjustments.createDraft(input)
    }
  }

  const workflowAdjustmentDraftId = matchWorkflowAdjustmentReadPath(
    request.method,
    request.path
  )
  if (workflowAdjustmentDraftId !== null) {
    if (!options.workflowAdjustments) {
      return {
        status: 400,
        json: {
          error: "Workflow adjustment store unavailable"
        }
      }
    }
    const draft = await options.workflowAdjustments.readDraft(workflowAdjustmentDraftId)
    if (!draft) {
      return {
        status: 404,
        json: {
          error: "Workflow adjustment draft not found"
        }
      }
    }
    return {
      status: 200,
      json: draft
    }
  }

  const workflowAdjustmentConfirmId = matchWorkflowAdjustmentConfirmPath(
    request.method,
    request.path
  )
  if (workflowAdjustmentConfirmId !== null) {
    if (!options.workflowAdjustments) {
      return {
        status: 400,
        json: {
          error: "Workflow adjustment store unavailable"
        }
      }
    }
    return {
      status: 200,
      json: await options.workflowAdjustments.confirmDraft(workflowAdjustmentConfirmId)
    }
  }

  if (request.method === "POST" && request.path === "/v1/evidence-bundles") {
    if (!options.evidenceReader) {
      return {
        status: 400,
        json: {
          error: "Evidence reader unavailable"
        }
      }
    }
    const filter = parseEvidenceBundleRequest(request.body)
    if (!filter) {
      return {
        status: 400,
        json: {
          error: "Invalid evidence bundle request body"
        }
      }
    }
    return {
      status: 200,
      json: await buildEvidenceBundle({
        evidenceReader: options.evidenceReader,
        sessionId: filter.sessionId,
        pluginId: filter.pluginId
      })
    }
  }

  if (request.method !== "POST" || request.path !== "/v1/evidence") {
    return {
      status: 404,
      json: {
        error: "Not found"
      }
    }
  }

  const body = request.body
  if (!isRecord(body) || !Array.isArray(body.records)) {
    return {
      status: 400,
      json: {
        accepted: 0,
        rejected: 0,
        errors: [
          {
            index: null,
            message: "Invalid evidence request body"
          }
        ]
      }
    }
  }

  let accepted = 0
  let rejected = 0
  const errors: EvidenceIngestError[] = []

  for (const [index, record] of body.records.entries()) {
    try {
      const envelope = validateEvidenceEnvelope(record)
      await options.evidenceSink.append(envelope)
      accepted += 1
    } catch (error) {
      rejected += 1
      errors.push({
        index,
        message: error instanceof Error ? error.message : String(error)
      })
    }
  }

  return {
    status: 200,
    json: {
      accepted,
      rejected,
      errors
    }
  }
}

function matchPluginLabPath(method: string, path: string): string | null {
  if (method !== "GET") {
    return null
  }
  const match = /^\/v1\/plugins\/([^/]+)\/lab$/.exec(path)
  if (!match) {
    return null
  }
  try {
    return decodeURIComponent(match[1])
  } catch {
    return null
  }
}

function isMalformedPluginLabPath(method: string, path: string): boolean {
  if (method !== "GET") {
    return false
  }
  const match = /^\/v1\/plugins\/([^/]+)\/lab$/.exec(path)
  if (!match) {
    return false
  }
  try {
    decodeURIComponent(match[1])
    return false
  } catch {
    return true
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function parsePluginLabActionRequest(body: unknown): PluginLabActionRequest | null {
  if (!isRecord(body) || typeof body.action !== "string") {
    return null
  }
  return {
    action: body.action,
    labMode: typeof body.labMode === "boolean" ? body.labMode : undefined,
    input: isRecord(body.input) ? body.input : undefined
  }
}

function parseWorkflowAdjustmentDraftRequest(
  body: unknown
): StoreCreateWorkflowAdjustmentDraftInput | null {
  if (!isRecord(body) || typeof body.feedback !== "string") {
    return null
  }
  return {
    feedback: body.feedback,
    sessionId: typeof body.sessionId === "string" ? body.sessionId : undefined,
    scope: isWorkflowAdjustmentScope(body.scope) ? body.scope : undefined,
    title: typeof body.title === "string" ? body.title : undefined,
    evidenceRefs: Array.isArray(body.evidenceRefs)
      ? body.evidenceRefs.filter((item): item is string => typeof item === "string")
      : undefined
  }
}

function parseEvidenceBundleRequest(body: unknown): {
  readonly sessionId?: string
  readonly pluginId?: string
} | null {
  if (!isRecord(body)) {
    return null
  }
  return {
    sessionId: typeof body.sessionId === "string" ? body.sessionId : undefined,
    pluginId: typeof body.pluginId === "string" ? body.pluginId : undefined
  }
}

function isWorkflowAdjustmentScope(
  value: unknown
): value is StoreCreateWorkflowAdjustmentDraftInput["scope"] {
  return value === "one-off" ||
    value === "session" ||
    value === "agent" ||
    value === "workflow-template"
}

function matchWorkflowReviewPath(method: string, path: string): string | null {
  if (method !== "GET") {
    return null
  }
  const match = /^\/v1\/sessions\/([^/]+)\/workflow-review$/.exec(path)
  if (!match) {
    return null
  }
  try {
    return decodeURIComponent(match[1])
  } catch {
    return null
  }
}

function isMalformedWorkflowReviewPath(method: string, path: string): boolean {
  if (method !== "GET") {
    return false
  }
  const match = /^\/v1\/sessions\/([^/]+)\/workflow-review$/.exec(path)
  if (!match) {
    return false
  }
  try {
    decodeURIComponent(match[1])
    return false
  } catch {
    return true
  }
}

function matchWorkflowAdjustmentReadPath(method: string, path: string): string | null {
  if (method !== "GET") {
    return null
  }
  const match = /^\/v1\/workflow-adjustments\/([^/]+)$/.exec(path)
  if (!match) {
    return null
  }
  try {
    return decodeURIComponent(match[1])
  } catch {
    return null
  }
}

function matchWorkflowAdjustmentConfirmPath(method: string, path: string): string | null {
  if (method !== "POST") {
    return null
  }
  const match = /^\/v1\/workflow-adjustments\/([^/]+)\/confirm$/.exec(path)
  if (!match) {
    return null
  }
  try {
    return decodeURIComponent(match[1])
  } catch {
    return null
  }
}
