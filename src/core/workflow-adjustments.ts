import { appendFile, mkdir, readFile } from "node:fs/promises"
import { dirname } from "node:path"

export type WorkflowAdjustmentScope =
  | "one-off"
  | "session"
  | "agent"
  | "workflow-template"

export type WorkflowAdjustmentRisk = "low" | "medium" | "high"

export type WorkflowAdjustmentRule = {
  readonly condition: string
  readonly action: string
  readonly risk: WorkflowAdjustmentRisk
  readonly evidenceRefs: readonly string[]
}

export type WorkflowAdjustmentDraftStatus = "draft" | "confirmed"

export type WorkflowAdjustmentDraft = {
  readonly draftId: string
  readonly status: WorkflowAdjustmentDraftStatus
  readonly title: string
  readonly userIntent: string
  readonly scope: WorkflowAdjustmentScope
  readonly sessionId?: string
  readonly proposedRules: readonly WorkflowAdjustmentRule[]
  readonly requiresConfirmation: true
  readonly createdAt: string
  readonly confirmedAt?: string
}

export type CreateWorkflowAdjustmentDraftInput = {
  readonly draftId: string
  readonly createdAt: string
  readonly sessionId?: string
  readonly feedback: string
  readonly scope?: WorkflowAdjustmentScope
  readonly title?: string
  readonly evidenceRefs?: readonly string[]
}

export type StoreCreateWorkflowAdjustmentDraftInput = {
  readonly sessionId?: string
  readonly feedback: string
  readonly scope?: WorkflowAdjustmentScope
  readonly title?: string
  readonly evidenceRefs?: readonly string[]
  readonly now?: () => string
}

export interface WorkflowAdjustmentRepository {
  createDraft(
    input: StoreCreateWorkflowAdjustmentDraftInput
  ): Promise<WorkflowAdjustmentDraft>
  readDraft(draftId: string): Promise<WorkflowAdjustmentDraft | null>
  confirmDraft(
    draftId: string,
    input?: {
      readonly confirmedAt?: string
    }
  ): Promise<WorkflowAdjustmentDraft>
  listDrafts(): Promise<readonly WorkflowAdjustmentDraft[]>
}

type DraftCreatedEvent = {
  readonly type: "draft.created"
  readonly draft: WorkflowAdjustmentDraft
}

type DraftConfirmedEvent = {
  readonly type: "draft.confirmed"
  readonly draftId: string
  readonly confirmedAt: string
}

type DraftEvent = DraftCreatedEvent | DraftConfirmedEvent

export function createWorkflowAdjustmentDraftFromFeedback(
  input: CreateWorkflowAdjustmentDraftInput
): WorkflowAdjustmentDraft {
  const feedback = input.feedback.trim()
  if (feedback.length === 0) {
    throw new Error("Workflow adjustment feedback is required")
  }

  const scope = input.scope ?? (input.sessionId ? "session" : "workflow-template")
  return {
    draftId: input.draftId,
    status: "draft",
    title: input.title?.trim() || titleFromFeedback(feedback),
    userIntent: feedback,
    scope,
    ...(input.sessionId ? { sessionId: input.sessionId } : {}),
    proposedRules: [
      {
        condition: conditionForScope(scope),
        action: feedback,
        risk: riskForFeedback(feedback),
        evidenceRefs: [...(input.evidenceRefs ?? [])]
      }
    ],
    requiresConfirmation: true,
    createdAt: input.createdAt
  }
}

export class JsonlWorkflowAdjustmentStore implements WorkflowAdjustmentRepository {
  readonly #path: string

  constructor(path: string) {
    this.#path = path
  }

  async createDraft(
    input: StoreCreateWorkflowAdjustmentDraftInput
  ): Promise<WorkflowAdjustmentDraft> {
    const drafts = await this.listDrafts()
    const draft = createWorkflowAdjustmentDraftFromFeedback({
      draftId: `draft_${drafts.length + 1}`,
      createdAt: input.now?.() ?? new Date().toISOString(),
      sessionId: input.sessionId,
      feedback: input.feedback,
      scope: input.scope,
      title: input.title,
      evidenceRefs: input.evidenceRefs
    })
    await this.#appendEvent({
      type: "draft.created",
      draft
    })
    return draft
  }

  async readDraft(draftId: string): Promise<WorkflowAdjustmentDraft | null> {
    return (await this.#projectDrafts()).get(draftId) ?? null
  }

  async confirmDraft(
    draftId: string,
    input: {
      readonly confirmedAt?: string
    } = {}
  ): Promise<WorkflowAdjustmentDraft> {
    const draft = await this.readDraft(draftId)
    if (!draft) {
      throw new Error(`Workflow adjustment draft not found: ${draftId}`)
    }
    const confirmedAt = input.confirmedAt ?? new Date().toISOString()
    await this.#appendEvent({
      type: "draft.confirmed",
      draftId,
      confirmedAt
    })
    return {
      ...draft,
      status: "confirmed",
      confirmedAt
    }
  }

  async listDrafts(): Promise<readonly WorkflowAdjustmentDraft[]> {
    return [...(await this.#projectDrafts()).values()]
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
  }

  async #projectDrafts(): Promise<Map<string, WorkflowAdjustmentDraft>> {
    const drafts = new Map<string, WorkflowAdjustmentDraft>()
    for (const event of await this.#readEvents()) {
      if (event.type === "draft.created") {
        drafts.set(event.draft.draftId, event.draft)
        continue
      }
      const draft = drafts.get(event.draftId)
      if (draft) {
        drafts.set(event.draftId, {
          ...draft,
          status: "confirmed",
          confirmedAt: event.confirmedAt
        })
      }
    }
    return drafts
  }

  async #appendEvent(event: DraftEvent): Promise<void> {
    await mkdir(dirname(this.#path), { recursive: true })
    await appendFile(this.#path, `${JSON.stringify(event)}\n`, "utf8")
  }

  async #readEvents(): Promise<readonly DraftEvent[]> {
    let content: string
    try {
      content = await readFile(this.#path, "utf8")
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") {
        return []
      }
      throw error
    }

    return content
      .split(/\r?\n/)
      .filter((line) => line.trim().length > 0)
      .map((line) => parseDraftEvent(JSON.parse(line)))
  }
}

function parseDraftEvent(value: unknown): DraftEvent {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid workflow adjustment event")
  }
  const event = value as Record<string, unknown>
  if (event.type === "draft.created") {
    return {
      type: "draft.created",
      draft: validateDraft(event.draft)
    }
  }
  if (
    event.type === "draft.confirmed" &&
    typeof event.draftId === "string" &&
    typeof event.confirmedAt === "string"
  ) {
    return {
      type: "draft.confirmed",
      draftId: event.draftId,
      confirmedAt: event.confirmedAt
    }
  }
  throw new Error("Invalid workflow adjustment event")
}

function validateDraft(value: unknown): WorkflowAdjustmentDraft {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid workflow adjustment draft")
  }
  const draft = value as WorkflowAdjustmentDraft
  if (
    typeof draft.draftId !== "string" ||
    (draft.status !== "draft" && draft.status !== "confirmed") ||
    typeof draft.title !== "string" ||
    typeof draft.userIntent !== "string" ||
    draft.requiresConfirmation !== true ||
    typeof draft.createdAt !== "string" ||
    !Array.isArray(draft.proposedRules)
  ) {
    throw new Error("Invalid workflow adjustment draft")
  }
  return draft
}

function titleFromFeedback(feedback: string): string {
  const normalized = feedback
    .replace(/^(next time|please|always|prefer|make sure to)[,\s]+/i, "")
    .replace(/[.!?]+$/g, "")
    .trim()
  const title = normalized.length > 0 ? normalized : feedback
  return `${title.slice(0, 1).toUpperCase()}${title.slice(1)}`.slice(0, 80)
}

function conditionForScope(scope: WorkflowAdjustmentScope): string {
  switch (scope) {
    case "one-off":
      return "For this workflow attempt only"
    case "session":
      return "When a similar workflow runs for this session"
    case "agent":
      return "When this agent handles a similar workflow"
    case "workflow-template":
      return "When a similar workflow template is reused"
  }
}

function riskForFeedback(feedback: string): WorkflowAdjustmentRisk {
  return /\b(always|never|automatically|delete|overwrite|permission|token|secret)\b/i.test(feedback)
    ? "medium"
    : "low"
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error
}
