import assert from "node:assert/strict"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  createMyhanakoBootstrap,
  renderMyhanakoAppShell
} from "../src/ui/app-shell.ts"
import registerMyhanakoStatusRoute from "../src/hana/plugin/routes/status.ts"
import { handleSidecarRequest } from "../src/server/api.ts"
import { JsonlWorkflowAdjustmentStore } from "../src/core/workflow-adjustments.ts"
import {
  EVIDENCE_SCHEMA_VERSION,
  validateEvidenceEnvelope
} from "../src/shared/evidence.ts"

const checks = []

try {
  await checkStandaloneUi()
  checks.push("standalone-ui")

  await checkEmbeddedRoute()
  checks.push("embedded-route")

  await checkLabActionApi()
  checks.push("lab-action-api")

  await checkWorkflowReviewApi()
  checks.push("workflow-review-api")

  await checkDraftApi()
  checks.push("draft-api")

  await checkBundleApi()
  checks.push("bundle-api")

  await checkDocs()
  checks.push("docs")

  process.stdout.write(JSON.stringify({ ok: true, checks }))
} catch (error) {
  process.stdout.write(JSON.stringify({
    ok: false,
    checks,
    error: error instanceof Error ? error.message : String(error)
  }))
  process.exitCode = 1
}

async function checkStandaloneUi() {
  const html = await readFile("assets/standalone.html", "utf8")
  const css = await readFile("assets/myhanako-app.css", "utf8")
  const js = await readFile("assets/myhanako-app.js", "utf8")
  const rendered = renderMyhanakoAppShell({
    mode: "standalone",
    bootstrap: createMyhanakoBootstrap({
      pluginId: "myhanako",
      apiBase: "/api/plugins/myhanako",
      version: "0.1.0",
      generatedAt: "2026-06-13T00:00:00.000Z"
    })
  })

  assert.match(html, /data-myhanako-app/)
  assert.match(html, /工作流复盘/)
  assert.match(rendered, /插件实验室/)
  assert.match(css, /\.state-error/)
  assert.match(js, /function runLabAction/)
}

async function checkEmbeddedRoute() {
  const routes = []
  registerMyhanakoStatusRoute(
    {
      get(path, handler) {
        routes.push({ path, handler })
      }
    },
    {
      pluginId: "myhanako"
    }
  )
  const route = routes.find((candidate) => candidate.path === "/status")
  assert.ok(route)
  const response = await route.handler({
    req: {
      query() {
        return undefined
      }
    },
    json(value, status = 200) {
      return { status, json: value }
    },
    html(value, status = 200) {
      return { status, html: value }
    }
  })

  assert.equal(response.status, 200)
  assert.match(response.html, /data-myhanako-app/)
  assert.match(response.html, /data-mode="embedded"/)
}

async function checkLabActionApi() {
  const response = await handleSidecarRequest(
    {
      method: "POST",
      path: "/v1/lab/actions",
      body: {
        action: "plugin.list_surfaces",
        input: {
          pluginId: "myhanako"
        }
      }
    },
    {
      evidenceSink: createSink(),
      pluginLab: {
        async readStatus() {
          return {
            status: "available",
            evidenceEventId: "evt_lab_status"
          }
        },
        async runAction(input) {
          assert.equal(input.action, "plugin.list_surfaces")
          return {
            status: "completed",
            actionId: "lab_1",
            evidenceEventId: "evt_lab_action_1",
            capability: "plugin.dev.listSurfaces",
            result: {
              surfaces: [
                {
                  type: "page",
                  route: "/status"
                }
              ]
            }
          }
        }
      }
    }
  )

  assert.equal(response.status, 200)
  assert.equal(response.json.status, "completed")
}

async function checkWorkflowReviewApi() {
  const response = await handleSidecarRequest(
    {
      method: "GET",
      path: "/v1/sessions/demo-session/workflow-review",
      body: null
    },
    {
      evidenceSink: createSink(),
      evidenceReader: createReader()
    }
  )

  assert.equal(response.status, 200)
  assert.equal(response.json.goal, "Finish P1 MVP")
  assert.deepEqual(response.json.stepsAttempted, ["Open Plugin Lab UI"])
}

async function checkDraftApi() {
  const dir = await mkdtemp(join(tmpdir(), "myhanako-mvp-"))
  try {
    const store = new JsonlWorkflowAdjustmentStore(join(dir, "drafts.jsonl"))
    const response = await handleSidecarRequest(
      {
        method: "POST",
        path: "/v1/workflow-adjustments/draft",
        body: {
          sessionId: "demo-session",
          feedback: "Prefer confirming destructive plugin lab actions first",
          scope: "session"
        }
      },
      {
        evidenceSink: createSink(),
        workflowAdjustments: store
      }
    )

    assert.equal(response.status, 200)
    assert.equal(response.json.status, "draft")
    assert.equal(response.json.requiresConfirmation, true)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

async function checkBundleApi() {
  const response = await handleSidecarRequest(
    {
      method: "POST",
      path: "/v1/evidence-bundles",
      body: {
        sessionId: "demo-session",
        pluginId: "myhanako"
      }
    },
    {
      evidenceSink: createSink(),
      evidenceReader: createReader()
    }
  )

  assert.equal(response.status, 200)
  assert.equal(response.json.redacted, true)
  assert.equal(response.json.recordCount, 3)
}

async function checkDocs() {
  const english = await readFile("README.md", "utf8")
  const chinese = await readFile("README.zh-CN.md", "utf8")
  const internal = await readFile("docs/p1-mvp-internal-test.md", "utf8")

  assert.match(english, /Task 31-37/)
  assert.match(chinese, /中文/)
  assert.match(chinese, /Task 31-37/)
  assert.match(internal, /内测/)
  assert.match(internal, /npm run smoke:p1-mvp/)
}

function createSink() {
  return {
    async append() {}
  }
}

function createReader() {
  const records = [
    createEnvelope({
      eventId: "evt_goal",
      eventType: "workflow.goal.set",
      sequence: 1,
      payload: {
        goal: "Finish P1 MVP"
      }
    }),
    createEnvelope({
      eventId: "evt_step",
      eventType: "workflow.step.completed",
      sequence: 2,
      payload: {
        step: "Open Plugin Lab UI"
      }
    }),
    createEnvelope({
      eventId: "evt_plugin",
      eventType: "plugin.used",
      sequence: 3,
      payload: {
        plugin: "myhanako"
      }
    })
  ]
  return {
    async readAll() {
      return records
    }
  }
}

function createEnvelope(overrides) {
  return validateEvidenceEnvelope({
    schemaVersion: EVIDENCE_SCHEMA_VERSION,
    eventId: "evt_1",
    eventType: "workflow.goal.set",
    timestamp: "2026-06-13T00:00:00.000Z",
    sequence: 1,
    hanaVersion: "0.310.1",
    adapterVersion: "0.1.0",
    probeVersion: "0.1.0",
    source: {
      capability: "mvp.smoke",
      stability: "experimental",
      layer: "workflow"
    },
    refs: {
      sessionPath: "demo-session",
      pluginId: "myhanako"
    },
    sensitivity: "internal",
    redaction: {
      applied: false,
      fields: []
    },
    payload: {},
    ...overrides
  })
}
