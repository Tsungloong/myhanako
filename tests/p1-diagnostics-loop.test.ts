import assert from "node:assert/strict"
import { mkdtemp, readFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"
import { EvidenceLog } from "../src/core/evidence-log.ts"
import { HanaAdapter, type HanaEventBus } from "../src/hana/adapter.ts"
import {
  createLogBackedPluginLab,
  createHanaEventBusAdapter,
  createPluginRouteStatus
} from "../src/hana/plugin/index.ts"
import registerMyhanakoStatusRoute from "../src/hana/plugin/routes/status.ts"
import { handleSidecarRequest } from "../src/server/api.ts"
import {
  EVIDENCE_SCHEMA_VERSION,
  type EvidenceEnvelope
} from "../src/shared/evidence.ts"

test("Hana plugin manifest declares a visible full-access Plugin Lab shell", async () => {
  const manifest = JSON.parse(
    await readFile("manifest.json", "utf8")
  )

  assert.deepEqual(manifest, {
    manifestVersion: 1,
    id: "myhanako",
    name: "myhanako",
    version: "0.1.0",
    description: "Workflow Review and Plugin Lab companion for HanaAgent.",
    trust: "full-access",
    activationEvents: ["onStartup"],
    contributes: {
      page: {
        title: "myhanako",
        route: "/status"
      }
    }
  })
})

test("log-backed plugin lab reads Hana diagnostics and persists redacted evidence", async () => {
  const log = await createTempEvidenceLog()
  const lab = createLogBackedPluginLab({
    adapter: new HanaAdapter({
      eventBus: createEventBus({
        diagnosticsResult: {
          devSlots: [
            {
              pluginId: "target-plugin",
              status: "loaded",
              apiKey: "secret-key"
            }
          ],
          logs: [
            {
              level: "info",
              message: "loaded"
            }
          ]
        }
      })
    }),
    evidenceLog: log,
    metadata: {
      hanaVersion: "0.301.8",
      hanaPluginProtocolVersion: 1,
      adapterVersion: "0.1.0",
      probeVersion: "0.1.0",
      piSdkVersion: "0.70.2",
      sessionPath: "session_1",
      timestamp: () => "2026-06-07T00:00:00.000Z",
      idSeed: "fixed"
    }
  })

  const status = await lab.readStatus("target-plugin")
  const records = await log.readAll()

  assert.deepEqual(status, {
    status: "available",
    evidenceEventId: "evt_plugin_diagnostics_fixed_1"
  })
  assert.equal(records.length, 1)
  assert.deepEqual(records[0], {
    schemaVersion: EVIDENCE_SCHEMA_VERSION,
    eventId: "evt_plugin_diagnostics_fixed_1",
    eventType: "plugin.diagnostics.read",
    timestamp: "2026-06-07T00:00:00.000Z",
    sequence: 1,
    hanaVersion: "0.301.8",
    hanaPluginProtocolVersion: 1,
    adapterVersion: "0.1.0",
    probeVersion: "0.1.0",
    piSdkVersion: "0.70.2",
    source: {
      capability: "plugin.dev.diagnostics",
      stability: "stable",
      layer: "plugin"
    },
    refs: {
      sessionPath: "session_1",
      pluginId: "target-plugin",
      labRunId: "lab_fixed_1"
    },
    sensitivity: "internal",
    redaction: {
      applied: true,
      fields: ["payload.diagnostics.devSlots.0.apiKey", "rawSource"]
    },
    payload: {
      status: "available",
      diagnostics: {
        devSlots: [
          {
            pluginId: "target-plugin",
            status: "loaded",
            apiKey: "[REDACTED]"
          }
        ],
        logs: [
          {
            level: "info",
            message: "loaded"
          }
        ]
      }
    },
    rawSource: "[REDACTED]"
  })
})

test("Hana plugin context bus binds to the diagnostics adapter", async () => {
  const adapter = createHanaEventBusAdapter({
    bus: createEventBus({
      diagnosticsResult: {
        ok: true
      }
    })
  })

  assert.deepEqual(await adapter.readPluginDiagnostics("target-plugin"), {
    status: "available",
    capability: "plugin.dev.diagnostics",
    stability: "stable",
    diagnostics: {
      ok: true
    }
  })
})

test("plugin lab route status writes evidence that workflow review reads from the same log", async () => {
  const log = await createTempEvidenceLog()
  await log.append(
    createEnvelope({
      eventId: "evt_goal",
      eventType: "workflow.goal.set",
      sequence: 1,
      refs: {
        sessionPath: "session_1"
      },
      source: {
        layer: "workflow"
      },
      payload: {
        goal: "Review target plugin diagnostics"
      }
    })
  )
  await log.append(
    createEnvelope({
      eventId: "evt_step",
      eventType: "workflow.step.completed",
      sequence: 2,
      refs: {
        sessionPath: "session_1"
      },
      source: {
        layer: "workflow"
      },
      payload: {
        step: "Run plugin diagnostics"
      }
    })
  )

  const lab = createLogBackedPluginLab({
    adapter: new HanaAdapter({
      eventBus: createEventBus({
        diagnosticsResult: {
          ok: true
        }
      })
    }),
    evidenceLog: log,
    metadata: {
      hanaVersion: "0.301.8",
      adapterVersion: "0.1.0",
      probeVersion: "0.1.0",
      sessionPath: "session_1",
      timestamp: () => "2026-06-07T00:00:00.000Z",
      idSeed: "route"
    }
  })

  const labResponse = await handleSidecarRequest(
    {
      method: "GET",
      path: "/v1/plugins/target-plugin/lab",
      body: null
    },
    {
      evidenceSink: log,
      evidenceReader: log,
      pluginLab: lab
    }
  )
  const reviewResponse = await handleSidecarRequest(
    {
      method: "GET",
      path: "/v1/sessions/session_1/workflow-review",
      body: null
    },
    {
      evidenceSink: log,
      evidenceReader: log
    }
  )

  assert.equal(labResponse.status, 200)
  assert.deepEqual(labResponse.json, {
    status: "available",
    evidenceEventId: "evt_plugin_diagnostics_route_3"
  })
  assert.equal(reviewResponse.status, 200)
  assert.equal("sessionId" in reviewResponse.json, true)
  assert.equal("toolsAndPluginsUsed" in reviewResponse.json, true)
  if (!("toolsAndPluginsUsed" in reviewResponse.json)) {
    throw new Error("Expected workflow review response")
  }
  assert.deepEqual(reviewResponse.json.toolsAndPluginsUsed, ["target-plugin"])
  assert.deepEqual(reviewResponse.json.evidenceRefs, [
    "evt_goal",
    "evt_step",
    "evt_plugin_diagnostics_route_3"
  ])
})

test("log-backed plugin lab serializes concurrent diagnostics evidence ids", async () => {
  const log = await createTempEvidenceLog()
  const lab = createLogBackedPluginLab({
    adapter: new HanaAdapter({
      eventBus: createEventBus({
        diagnosticsResult: {
          ok: true
        }
      })
    }),
    evidenceLog: log,
    metadata: {
      hanaVersion: "0.301.8",
      adapterVersion: "0.1.0",
      probeVersion: "0.1.0",
      timestamp: () => "2026-06-07T00:00:00.000Z",
      idSeed: "parallel"
    }
  })

  const statuses = await Promise.all([
    lab.readStatus("target-plugin"),
    lab.readStatus("target-plugin")
  ])
  const records = await log.readAll()

  assert.deepEqual(
    statuses.map((status) => status.evidenceEventId),
    [
      "evt_plugin_diagnostics_parallel_1",
      "evt_plugin_diagnostics_parallel_2"
    ]
  )
  assert.deepEqual(
    records.map((record) => ({
      eventId: record.eventId,
      sequence: record.sequence,
      labRunId: record.refs.labRunId
    })),
    [
      {
        eventId: "evt_plugin_diagnostics_parallel_1",
        sequence: 1,
        labRunId: "lab_parallel_1"
      },
      {
        eventId: "evt_plugin_diagnostics_parallel_2",
        sequence: 2,
        labRunId: "lab_parallel_2"
      }
    ]
  )
})

test("plugin route status degrades when sidecar-backed diagnostics fail open", async () => {
  const status = await createPluginRouteStatus({
    pluginId: "myhanako",
    sidecar: {
      async readStatus() {
        throw new Error("sidecar offline")
      }
    }
  })

  assert.deepEqual(status, {
    hostPluginId: "myhanako",
    targetPluginId: "myhanako",
    pluginId: "myhanako",
    status: "degraded",
    reason: "sidecar offline"
  })
})

test("Hana plugin status route exposes status without touching Hana sessions", async () => {
  const routes: {
    readonly path: string
    readonly handler: (context: FakeRouteContext) => Promise<unknown>
  }[] = []

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

  assert.equal(routes.length, 1)
  assert.equal(routes[0].path, "/status")
  const response = await routes[0].handler(createFakeRouteContext("target-plugin"))

  assert.deepEqual(response, {
    status: 200,
    json: {
      hostPluginId: "myhanako",
      targetPluginId: "target-plugin",
      pluginId: "target-plugin",
      status: "degraded",
      reason: "sidecar unavailable"
    }
  })
})

test("Hana plugin status route builds diagnostics lab from ctx bus and data dir", async () => {
  const root = await mkdtemp(join(tmpdir(), "myhanako-route-lab-"))
  const routes: {
    readonly path: string
    readonly handler: (context: FakeRouteContext) => Promise<unknown>
  }[] = []

  registerMyhanakoStatusRoute(
    {
      get(path, handler) {
        routes.push({ path, handler })
      }
    },
    {
      pluginId: "myhanako",
      dataDir: root,
      bus: createEventBus({
        diagnosticsResult: {
          ok: true
        }
      })
    }
  )

  const response = await routes[0].handler(createFakeRouteContext("target-plugin"))
  const records = await new EvidenceLog(join(root, "evidence.jsonl")).readAll()

  assert.deepEqual(response, {
    status: 200,
    json: {
      hostPluginId: "myhanako",
      targetPluginId: "target-plugin",
      pluginId: "target-plugin",
      status: "available",
      evidenceEventId: "evt_plugin_diagnostics_myhanako_1"
    }
  })
  assert.deepEqual(
    records.map((record) => ({
      eventId: record.eventId,
      pluginId: record.refs.pluginId,
      sequence: record.sequence
    })),
    [
      {
        eventId: "evt_plugin_diagnostics_myhanako_1",
        pluginId: "target-plugin",
        sequence: 1
      }
    ]
  )
})

test("Hana plugin lab action route lists surfaces through ctx bus and writes evidence", async () => {
  const root = await mkdtemp(join(tmpdir(), "myhanako-route-action-"))
  const routes: {
    readonly path: string
    readonly method: "GET" | "POST"
    readonly handler: (context: FakeRouteContext) => Promise<unknown>
  }[] = []

  registerMyhanakoStatusRoute(
    {
      get(path, handler) {
        routes.push({ method: "GET", path, handler })
      },
      post(path, handler) {
        routes.push({ method: "POST", path, handler })
      }
    },
    {
      pluginId: "myhanako",
      dataDir: root,
      bus: createEventBus({
        diagnosticsResult: {
          ok: true
        },
        surfacesResult: [
          {
            kind: "page",
            pluginId: "target-plugin",
            title: "Status",
            route: "/status",
            routeUrl: "/api/plugins/target-plugin/status",
            hostCapabilities: []
          }
        ]
      })
    }
  )

  const actionRoute = routes.find((route) => route.method === "POST")
  if (!actionRoute) {
    throw new Error("Expected lab action route")
  }
  const response = await actionRoute.handler(
    createFakeRouteContext("target-plugin", {
      action: "plugin.list_surfaces",
      input: {
        pluginId: "target-plugin"
      }
    })
  )
  const records = await new EvidenceLog(join(root, "evidence.jsonl")).readAll()

  assert.deepEqual(response, {
    status: 200,
    json: {
      status: "completed",
      actionId: "lab_myhanako_1",
      evidenceEventId: "evt_lab_action_myhanako_1",
      capability: "plugin.dev.listSurfaces",
      result: {
        surfaces: [
          {
            kind: "page",
            pluginId: "target-plugin",
            title: "Status",
            route: "/status",
            routeUrl: "/api/plugins/target-plugin/status",
            hostCapabilities: []
          }
        ]
      }
    }
  })
  assert.deepEqual(
    records.map((record) => ({
      eventId: record.eventId,
      eventType: record.eventType,
      capability: record.source.capability,
      pluginId: record.refs.pluginId
    })),
    [
      {
        eventId: "evt_lab_action_myhanako_1",
        eventType: "lab.action.completed",
        capability: "plugin.dev.listSurfaces",
        pluginId: "target-plugin"
      }
    ]
  )
})

async function createTempEvidenceLog(): Promise<EvidenceLog> {
  const root = await mkdtemp(join(tmpdir(), "myhanako-p1-loop-"))
  return new EvidenceLog(join(root, "evidence.jsonl"))
}

function createEventBus(options: {
  readonly diagnosticsResult: unknown
  readonly surfacesResult?: unknown
}): HanaEventBus {
  return {
    listCapabilities() {
      return [
        {
          type: "plugin.dev.diagnostics",
          available: true,
          stability: "stable"
        },
        ...(options.surfacesResult === undefined
          ? []
          : [
              {
                type: "plugin.dev.listSurfaces",
                available: true,
                stability: "experimental"
              }
            ])
      ]
    },
    async request(capability, payload) {
      if (capability === "plugin.dev.listSurfaces") {
        assert.deepEqual(payload, {
          pluginId: "target-plugin"
        })
        return options.surfacesResult
      }
      assert.equal(capability, "plugin.dev.diagnostics")
      assert.deepEqual(payload, {
        pluginId: "target-plugin"
      })
      return options.diagnosticsResult
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
    adapterVersion: "0.1.0",
    probeVersion: "0.1.0",
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
      goal: "Review target plugin diagnostics"
    },
    ...overrides
  }
}

type FakeRouteContext = {
  readonly req: {
    query(name: string): string | undefined
    json?(): Promise<unknown>
  }
  json(value: unknown, status?: number): unknown
}

function createFakeRouteContext(targetPluginId: string, body?: unknown): FakeRouteContext {
  return {
    req: {
      query(name) {
        return name === "pluginId" ? targetPluginId : undefined
      },
      async json() {
        return body
      }
    },
    json(value, status = 200) {
      return {
        status,
        json: value
      }
    }
  }
}
