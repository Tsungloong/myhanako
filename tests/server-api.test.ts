import assert from "node:assert/strict"
import test from "node:test"
import {
  handleSidecarRequest,
  type EvidenceSink
} from "../src/server/api.ts"
import {
  EVIDENCE_SCHEMA_VERSION,
  type EvidenceEnvelope
} from "../src/shared/evidence.ts"

test("handleSidecarRequest accepts and rejects evidence records independently", async () => {
  const sink = createSink()

  const response = await handleSidecarRequest(
    {
      method: "POST",
      path: "/v1/evidence",
      body: {
        records: [
          createEnvelope({ eventId: "evt_1", sequence: 1 }),
          createEnvelope({ eventId: "evt_bad", sequence: 0 }),
          createEnvelope({ eventId: "evt_2", sequence: 2 })
        ]
      }
    },
    {
      evidenceSink: sink
    }
  )

  assert.equal(response.status, 200)
  assert.deepEqual(response.json, {
    accepted: 2,
    rejected: 1,
    errors: [
      {
        index: 1,
        message: "Invalid evidence sequence"
      }
    ]
  })
  assert.deepEqual(
    sink.records.map((record) => record.eventId),
    ["evt_1", "evt_2"]
  )
})

test("handleSidecarRequest rejects non-array evidence bodies", async () => {
  const response = await handleSidecarRequest(
    {
      method: "POST",
      path: "/v1/evidence",
      body: {
        records: {}
      }
    },
    {
      evidenceSink: createSink()
    }
  )

  assert.equal(response.status, 400)
  assert.deepEqual(response.json, {
    accepted: 0,
    rejected: 0,
    errors: [
      {
        index: null,
        message: "Invalid evidence request body"
      }
    ]
  })
})

test("handleSidecarRequest reports sink append failures per record", async () => {
  const response = await handleSidecarRequest(
    {
      method: "POST",
      path: "/v1/evidence",
      body: {
        records: [
          createEnvelope({
            eventId: "evt_1"
          })
        ]
      }
    },
    {
      evidenceSink: {
        async append() {
          throw new Error("evidence sink unavailable")
        }
      }
    }
  )

  assert.equal(response.status, 200)
  assert.deepEqual(response.json, {
    accepted: 0,
    rejected: 1,
    errors: [
      {
        index: 0,
        message: "evidence sink unavailable"
      }
    ]
  })
})

test("handleSidecarRequest returns plugin lab status", async () => {
  const response = await handleSidecarRequest(
    {
      method: "GET",
      path: "/v1/plugins/myhanako/lab",
      body: null
    },
    {
      evidenceSink: createSink(),
      pluginLab: {
        async readStatus(pluginId) {
          assert.equal(pluginId, "myhanako")
          return {
            status: "available",
            evidenceEventId: "evt_plugin_diagnostics_1"
          }
        }
      }
    }
  )

  assert.equal(response.status, 200)
  assert.deepEqual(response.json, {
    status: "available",
    evidenceEventId: "evt_plugin_diagnostics_1"
  })
})

test("handleSidecarRequest returns not found for unsupported routes", async () => {
  const response = await handleSidecarRequest(
    {
      method: "GET",
      path: "/v1/evidence",
      body: null
    },
    {
      evidenceSink: createSink()
    }
  )

  assert.equal(response.status, 404)
  assert.deepEqual(response.json, {
    error: "Not found"
  })
})

function createSink(): EvidenceSink & { readonly records: EvidenceEnvelope[] } {
  const records: EvidenceEnvelope[] = []
  return {
    records,
    async append(record) {
      records.push(record)
    }
  }
}

function createEnvelope(overrides: Partial<EvidenceEnvelope> = {}): EvidenceEnvelope {
  return {
    schemaVersion: EVIDENCE_SCHEMA_VERSION,
    eventId: "evt_1",
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
      pluginId: "myhanako"
    },
    sensitivity: "internal",
    redaction: {
      applied: false,
      fields: []
    },
    payload: {
      status: "available"
    },
    ...overrides
  }
}
