import assert from "node:assert/strict"
import test from "node:test"
import {
  buildEvidenceBundle,
  type EvidenceBundleReader
} from "../src/core/evidence-bundle.ts"
import { redactEvidenceForExport } from "../src/core/redaction.ts"
import { handleSidecarRequest } from "../src/server/api.ts"
import {
  EVIDENCE_SCHEMA_VERSION,
  type EvidenceEnvelope
} from "../src/shared/evidence.ts"

test("buildEvidenceBundle exports filtered redacted evidence with manifest metadata", async () => {
  const bundle = await buildEvidenceBundle({
    evidenceReader: createReader([
      createEnvelope({
        eventId: "evt_1",
        sequence: 1,
        refs: {
          sessionPath: "session_1",
          pluginId: "target-plugin"
        },
        payload: {
          apiKey: "secret",
          path: "C:\\Users\\Alice\\.hanako\\config.json"
        },
        rawSource: {
          token: "secret-token"
        }
      }),
      createEnvelope({
        eventId: "evt_2",
        sequence: 2,
        refs: {
          sessionPath: "session_2"
        }
      })
    ]),
    sessionId: "session_1",
    createdAt: "2026-06-13T00:00:00.000Z",
    bundleId: "bundle_1"
  })

  assert.equal(bundle.bundleId, "bundle_1")
  assert.equal(bundle.recordCount, 1)
  assert.deepEqual(bundle.filters, {
    sessionId: "session_1"
  })
  assert.deepEqual(bundle.manifest.evidenceRefs, ["evt_1"])
  assert.deepEqual(bundle.manifest.redactionFields, [
    "payload.apiKey",
    "payload.path",
    "rawSource"
  ])
  assert.deepEqual(bundle.records[0].payload, {
    apiKey: "[REDACTED]",
    path: "C:\\Users\\[REDACTED]\\.hanako\\config.json"
  })
  assert.equal(bundle.records[0].rawSource, "[REDACTED]")
})

test("redaction covers common access token, cookie, private key, and user path shapes", () => {
  const redacted = redactEvidenceForExport(
    createEnvelope({
      payload: {
        accessToken: "secret-access-token",
        setCookie: "sid=secret",
        privateKey: "-----BEGIN PRIVATE KEY-----abc",
        unixPath: "/home/alice/.hanako/config.json",
        macPath: "/Users/alice/.hanako/config.json",
        windowsPath: "C:\\Users\\Alice\\.hanako\\config.json",
        log: "Authorization: Bearer secret-token"
      }
    })
  )

  assert.deepEqual(redacted.payload, {
    accessToken: "[REDACTED]",
    setCookie: "[REDACTED]",
    privateKey: "[REDACTED]",
    unixPath: "/home/[REDACTED]/.hanako/config.json",
    macPath: "/Users/[REDACTED]/.hanako/config.json",
    windowsPath: "C:\\Users\\[REDACTED]\\.hanako\\config.json",
    log: "[REDACTED]"
  })
  assert.deepEqual(redacted.redaction.fields, [
    "payload.accessToken",
    "payload.setCookie",
    "payload.privateKey",
    "payload.unixPath",
    "payload.macPath",
    "payload.windowsPath",
    "payload.log"
  ])
})

test("sidecar exports evidence bundle through API", async () => {
  const response = await handleSidecarRequest(
    {
      method: "POST",
      path: "/v1/evidence-bundles",
      body: {
        pluginId: "target-plugin"
      }
    },
    {
      evidenceSink: {
        async append() {}
      },
      evidenceReader: createReader([
        createEnvelope({
          eventId: "evt_plugin",
          refs: {
            pluginId: "target-plugin"
          },
          payload: {
            ok: true
          }
        })
      ])
    }
  )

  assert.equal(response.status, 200)
  assert.equal("recordCount" in response.json, true)
  if (!("recordCount" in response.json)) {
    throw new Error("Expected evidence bundle response")
  }
  assert.equal(response.json.recordCount, 1)
  assert.deepEqual(response.json.filters, {
    pluginId: "target-plugin"
  })
})

function createReader(records: readonly EvidenceEnvelope[]): EvidenceBundleReader {
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
    eventType: "plugin.diagnostics.read",
    timestamp: "2026-06-13T00:00:00.000Z",
    sequence: 1,
    hanaVersion: "0.310.1",
    adapterVersion: "0.1.0",
    probeVersion: "0.1.0",
    source: {
      layer: "plugin"
    },
    refs: {},
    sensitivity: "internal",
    redaction: {
      applied: false,
      fields: []
    },
    payload: {
      ok: true
    },
    ...overrides
  }
}
