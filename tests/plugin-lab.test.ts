import assert from "node:assert/strict"
import test from "node:test"
import {
  runPluginDiagnosticsLab,
  type PluginDiagnosticsReader
} from "../src/hana/plugin/index.ts"
import type { PluginDiagnosticsResult } from "../src/hana/adapter.ts"
import type { EvidenceSink } from "../src/server/api.ts"
import type { EvidenceEnvelope } from "../src/shared/evidence.ts"

test("runPluginDiagnosticsLab writes diagnostics evidence when Hana diagnostics are available", async () => {
  const sink = createSink()

  const status = await runPluginDiagnosticsLab({
    adapter: createAdapter({
      status: "available",
      capability: "plugin.dev.diagnostics",
      stability: "experimental",
      diagnostics: {
        ok: true
      }
    }),
    evidenceSink: sink,
    metadata: createMetadata()
  })

  assert.deepEqual(status, {
    status: "available",
    evidenceEventId: "evt_plugin_diagnostics_1"
  })
  assert.equal(sink.records.length, 1)
  assert.equal(sink.records[0].eventType, "plugin.diagnostics.read")
  assert.equal(sink.records[0].source.layer, "plugin")
  assert.equal(sink.records[0].source.stability, "experimental")
  assert.deepEqual(sink.records[0].payload, {
    status: "available",
    diagnostics: {
      ok: true
    }
  })
})

test("runPluginDiagnosticsLab returns unavailable evidence when Hana capability is missing", async () => {
  const sink = createSink()

  const status = await runPluginDiagnosticsLab({
    adapter: createAdapter({
      status: "unavailable",
      reason: "Missing Hana capability: plugin.dev.diagnostics",
      capability: "plugin.dev.diagnostics"
    }),
    evidenceSink: sink,
    metadata: createMetadata()
  })

  assert.deepEqual(status, {
    status: "unavailable",
    reason: "Missing Hana capability: plugin.dev.diagnostics",
    evidenceEventId: "evt_plugin_diagnostics_1"
  })
  assert.deepEqual(sink.records[0].payload, {
    status: "unavailable",
    reason: "Missing Hana capability: plugin.dev.diagnostics"
  })
})

test("runPluginDiagnosticsLab returns degraded when evidence sink is unavailable", async () => {
  const status = await runPluginDiagnosticsLab({
    adapter: createAdapter({
      status: "available",
      capability: "plugin.dev.diagnostics",
      stability: "experimental",
      diagnostics: {
        ok: true
      }
    }),
    evidenceSink: {
      async append() {
        throw new Error("sidecar closed")
      }
    },
    metadata: createMetadata()
  })

  assert.deepEqual(status, {
    status: "degraded",
    reason: "sidecar closed"
  })
})

test("runPluginDiagnosticsLab returns degraded when adapter diagnostics throw", async () => {
  const status = await runPluginDiagnosticsLab({
    adapter: {
      async readPluginDiagnostics() {
        throw new Error("adapter failed")
      }
    },
    evidenceSink: createSink(),
    metadata: createMetadata()
  })

  assert.deepEqual(status, {
    status: "degraded",
    reason: "adapter failed"
  })
})

test("runPluginDiagnosticsLab returns degraded when diagnostics are not valid evidence JSON", async () => {
  const status = await runPluginDiagnosticsLab({
    adapter: createAdapter({
      status: "available",
      capability: "plugin.dev.diagnostics",
      diagnostics: {
        bad: 1n
      }
    }),
    evidenceSink: createSink(),
    metadata: createMetadata()
  })

  assert.deepEqual(status, {
    status: "degraded",
    reason: "Invalid evidence payload.diagnostics.bad"
  })
})

test("runPluginDiagnosticsLab allocates distinct evidence refs for repeated runs", async () => {
  const sink = createSink()
  const metadata = createMetadata({
    labRunId: "lab_1",
    eventId: "evt_plugin_diagnostics_1",
    sequence: 1
  })

  await runPluginDiagnosticsLab({
    adapter: createAdapter({
      status: "available",
      capability: "plugin.dev.diagnostics",
      diagnostics: {
        ok: true
      }
    }),
    evidenceSink: sink,
    metadata
  })
  await runPluginDiagnosticsLab({
    adapter: createAdapter({
      status: "available",
      capability: "plugin.dev.diagnostics",
      diagnostics: {
        ok: true
      }
    }),
    evidenceSink: sink,
    metadata: createMetadata({
      labRunId: "lab_2",
      eventId: "evt_plugin_diagnostics_2",
      sequence: 2
    })
  })

  assert.deepEqual(
    sink.records.map((record) => ({
      eventId: record.eventId,
      sequence: record.sequence,
      labRunId: record.refs.labRunId
    })),
    [
      {
        eventId: "evt_plugin_diagnostics_1",
        sequence: 1,
        labRunId: "lab_1"
      },
      {
        eventId: "evt_plugin_diagnostics_2",
        sequence: 2,
        labRunId: "lab_2"
      }
    ]
  )
})

function createAdapter(result: PluginDiagnosticsResult): PluginDiagnosticsReader {
  return {
    async readPluginDiagnostics() {
      return result
    }
  }
}

function createSink(): EvidenceSink & { readonly records: EvidenceEnvelope[] } {
  const records: EvidenceEnvelope[] = []
  return {
    records,
    async append(record) {
      records.push(record)
    }
  }
}

function createMetadata(
  overrides: Partial<{
    pluginId: string
    hanaVersion: string
    hanaPluginProtocolVersion: number
    adapterVersion: string
    probeVersion: string
    piSdkVersion: string
    timestamp: string
    labRunId: string
    eventId: string
    sequence: number
  }> = {}
) {
  return {
    pluginId: "myhanako",
    hanaVersion: "0.301.8",
    hanaPluginProtocolVersion: 1,
    adapterVersion: "0.1.0",
    probeVersion: "0.1.0",
    piSdkVersion: "0.70.2",
    timestamp: "2026-06-07T00:00:00.000Z",
    eventId: "evt_plugin_diagnostics_1",
    sequence: 1,
    ...overrides
  }
}
