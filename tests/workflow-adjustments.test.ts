import assert from "node:assert/strict"
import { mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"
import {
  JsonlWorkflowAdjustmentStore,
  createWorkflowAdjustmentDraftFromFeedback
} from "../src/core/workflow-adjustments.ts"
import { handleSidecarRequest } from "../src/server/api.ts"

test("feedback creates a confirmable workflow adjustment draft without executing it", async () => {
  const draft = createWorkflowAdjustmentDraftFromFeedback({
    draftId: "draft_1",
    createdAt: "2026-06-13T00:00:00.000Z",
    sessionId: "session_1",
    feedback: "Next time, inspect plugin surfaces before invoking tools.",
    evidenceRefs: ["evt_surfaces"]
  })

  assert.deepEqual(draft, {
    draftId: "draft_1",
    status: "draft",
    title: "Inspect plugin surfaces before invoking tools",
    userIntent: "Next time, inspect plugin surfaces before invoking tools.",
    scope: "session",
    sessionId: "session_1",
    proposedRules: [
      {
        condition: "When a similar workflow runs for this session",
        action: "Next time, inspect plugin surfaces before invoking tools.",
        risk: "low",
        evidenceRefs: ["evt_surfaces"]
      }
    ],
    requiresConfirmation: true,
    createdAt: "2026-06-13T00:00:00.000Z"
  })
})

test("workflow adjustment store persists draft and confirmation events", async () => {
  const store = new JsonlWorkflowAdjustmentStore(
    join(await mkdtemp(join(tmpdir(), "myhanako-drafts-")), "drafts.jsonl")
  )

  const draft = await store.createDraft({
    sessionId: "session_1",
    feedback: "Prefer diagnostics before reload.",
    evidenceRefs: ["evt_diagnostics"],
    now: () => "2026-06-13T00:00:00.000Z"
  })
  const found = await store.readDraft(draft.draftId)
  const confirmed = await store.confirmDraft(draft.draftId, {
    confirmedAt: "2026-06-13T00:01:00.000Z"
  })

  assert.equal(found?.status, "draft")
  assert.equal(confirmed.status, "confirmed")
  assert.equal(confirmed.confirmedAt, "2026-06-13T00:01:00.000Z")
  assert.equal(confirmed.requiresConfirmation, true)
  assert.deepEqual(
    (await store.listDrafts()).map((item) => ({
      draftId: item.draftId,
      status: item.status
    })),
    [
      {
        draftId: draft.draftId,
        status: "confirmed"
      }
    ]
  )
})

test("sidecar exposes draft create read and confirm APIs", async () => {
  const store = new JsonlWorkflowAdjustmentStore(
    join(await mkdtemp(join(tmpdir(), "myhanako-draft-api-")), "drafts.jsonl")
  )

  const createResponse = await handleSidecarRequest(
    {
      method: "POST",
      path: "/v1/workflow-adjustments/draft",
      body: {
        sessionId: "session_1",
        feedback: "Always capture an evidence bundle before filing issues.",
        evidenceRefs: ["evt_export"]
      }
    },
    {
      evidenceSink: {
        async append() {}
      },
      workflowAdjustments: store
    }
  )

  assert.equal(createResponse.status, 200)
  assert.equal("draftId" in createResponse.json, true)
  if (!("draftId" in createResponse.json)) {
    throw new Error("Expected draft response")
  }

  const readResponse = await handleSidecarRequest(
    {
      method: "GET",
      path: `/v1/workflow-adjustments/${encodeURIComponent(createResponse.json.draftId)}`,
      body: null
    },
    {
      evidenceSink: {
        async append() {}
      },
      workflowAdjustments: store
    }
  )
  const confirmResponse = await handleSidecarRequest(
    {
      method: "POST",
      path: `/v1/workflow-adjustments/${encodeURIComponent(createResponse.json.draftId)}/confirm`,
      body: null
    },
    {
      evidenceSink: {
        async append() {}
      },
      workflowAdjustments: store
    }
  )

  assert.equal(readResponse.status, 200)
  assert.equal(confirmResponse.status, 200)
  assert.equal("status" in confirmResponse.json, true)
  if (!("status" in confirmResponse.json)) {
    throw new Error("Expected confirmed draft response")
  }
  assert.equal(confirmResponse.json.status, "confirmed")
})
