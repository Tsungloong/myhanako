import assert from "node:assert/strict"
import test from "node:test"
import {
  buildWorkflowReview,
  type EvidenceReader
} from "../src/core/workflow-review.ts"
import { handleSidecarRequest } from "../src/server/api.ts"
import {
  EVIDENCE_SCHEMA_VERSION,
  type EvidenceEnvelope
} from "../src/shared/evidence.ts"

test("buildWorkflowReview projects workflow evidence without exposing raw evidence", async () => {
  const review = await buildWorkflowReview({
    evidenceReader: createReader([
      createEnvelope({
        eventId: "evt_goal",
        sequence: 1,
        eventType: "workflow.goal.set",
        source: {
          layer: "workflow"
        },
        refs: {
          sessionPath: "session_1"
        },
        payload: {
          goal: "Ship P1 review loop"
        }
      }),
      createEnvelope({
        eventId: "evt_step",
        sequence: 2,
        eventType: "workflow.step.completed",
        source: {
          layer: "workflow"
        },
        refs: {
          sessionPath: "session_1"
        },
        payload: {
          step: "Read Hana plugin facts"
        }
      }),
      createEnvelope({
        eventId: "evt_tool",
        sequence: 3,
        eventType: "tool.used",
        source: {
          layer: "tool"
        },
        refs: {
          sessionPath: "session_1"
        },
        payload: {
          tool: "rg"
        }
      }),
      createEnvelope({
        eventId: "evt_plugin",
        sequence: 4,
        eventType: "plugin.diagnostics.read",
        source: {
          layer: "plugin"
        },
        refs: {
          sessionPath: "session_1",
          pluginId: "myhanako"
        },
        payload: {
          status: "available"
        }
      }),
      createEnvelope({
        eventId: "evt_context",
        sequence: 5,
        eventType: "context.used",
        source: {
          layer: "prompt"
        },
        refs: {
          sessionPath: "session_1"
        },
        payload: {
          context: "docs/p1-reference.md"
        }
      }),
      createEnvelope({
        eventId: "evt_uncertainty",
        sequence: 6,
        eventType: "workflow.uncertainty.noted",
        source: {
          layer: "workflow"
        },
        refs: {
          sessionPath: "session_1"
        },
        payload: {
          uncertainty: "Hana target commit still pending"
        }
      }),
      createEnvelope({
        eventId: "evt_adjustment",
        sequence: 7,
        eventType: "workflow.adjustment.suggested",
        source: {
          layer: "workflow"
        },
        refs: {
          sessionPath: "session_1"
        },
        payload: {
          adjustment: "Keep changes read-only"
        }
      })
    ]),
    sessionId: "session_1"
  })

  assert.deepEqual(review, {
    sessionId: "session_1",
    partial: false,
    partialReasons: [],
    goal: "Ship P1 review loop",
    stepsAttempted: ["Read Hana plugin facts"],
    toolsAndPluginsUsed: ["rg", "myhanako"],
    contextUsed: ["docs/p1-reference.md"],
    uncertaintyPoints: ["Hana target commit still pending"],
    suggestedAdjustments: ["Keep changes read-only"],
    evidenceRefs: [
      "evt_goal",
      "evt_step",
      "evt_tool",
      "evt_plugin",
      "evt_context",
      "evt_uncertainty",
      "evt_adjustment"
    ]
  })
})

test("buildWorkflowReview marks incomplete evidence as partial", async () => {
  const review = await buildWorkflowReview({
    evidenceReader: createReader([]),
    sessionId: "session_missing"
  })

  assert.equal(review.partial, true)
  assert.deepEqual(review.partialReasons, [
    "Missing goal evidence",
    "Missing workflow step evidence"
  ])
})

test("buildWorkflowReview filters evidence by session id", async () => {
  const review = await buildWorkflowReview({
    evidenceReader: createReader([
      createEnvelope({
        eventId: "evt_goal_1",
        refs: {
          sessionPath: "session_1"
        },
        payload: {
          goal: "Visible goal"
        }
      }),
      createEnvelope({
        eventId: "evt_goal_2",
        refs: {
          sessionPath: "session_2"
        },
        payload: {
          goal: "Hidden goal"
        }
      })
    ]),
    sessionId: "session_1"
  })

  assert.equal(review.goal, "Visible goal")
  assert.deepEqual(review.evidenceRefs, ["evt_goal_1"])
})

test("handleSidecarRequest returns workflow review projection", async () => {
  const response = await handleSidecarRequest(
    {
      method: "GET",
      path: "/v1/sessions/session_1/workflow-review",
      body: null
    },
    {
      evidenceSink: {
        async append() {}
      },
      evidenceReader: createReader([
        createEnvelope({
          eventId: "evt_goal",
          eventType: "workflow.goal.set",
          refs: {
            sessionPath: "session_1"
          },
          source: {
            layer: "workflow"
          },
          payload: {
            goal: "Ship P1 review loop"
          }
        })
      ])
    }
  )

  assert.equal(response.status, 200)
  assert.equal("sessionId" in response.json, true)
  assert.equal("goal" in response.json, true)
  if (!("goal" in response.json)) {
    throw new Error("Expected workflow review response")
  }
  assert.equal(response.json.sessionId, "session_1")
  assert.equal(response.json.goal, "Ship P1 review loop")
  assert.equal("rawSource" in response.json, false)
})

test("handleSidecarRequest does not throw for malformed workflow review session ids", async () => {
  const response = await handleSidecarRequest(
    {
      method: "GET",
      path: "/v1/sessions/%E0%A4%A/workflow-review",
      body: null
    },
    {
      evidenceSink: {
        async append() {}
      },
      evidenceReader: createReader([])
    }
  )

  assert.equal(response.status, 400)
  assert.deepEqual(response.json, {
    accepted: 0,
    rejected: 0,
    errors: [
      {
        index: null,
        message: "Invalid workflow review session id"
      }
    ]
  })
})

function createReader(records: readonly EvidenceEnvelope[]): EvidenceReader {
  return {
    async readAll() {
      return records
    }
  }
}

function createEnvelope(overrides: Partial<EvidenceEnvelope> = {}): EvidenceEnvelope {
  return {
    schemaVersion: EVIDENCE_SCHEMA_VERSION,
    eventId: "evt_1",
    eventType: "workflow.goal.set",
    timestamp: "2026-06-07T00:00:00.000Z",
    sequence: 1,
    hanaVersion: "0.301.8",
    hanaPluginProtocolVersion: 1,
    adapterVersion: "0.1.0",
    probeVersion: "0.1.0",
    piSdkVersion: "0.70.2",
    source: {
      stability: "stable",
      layer: "workflow"
    },
    refs: {
      sessionPath: "session_1"
    },
    sensitivity: "internal",
    redaction: {
      applied: false,
      fields: []
    },
    payload: {
      goal: "Ship P1 review loop"
    },
    ...overrides
  }
}
