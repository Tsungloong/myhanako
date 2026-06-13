import assert from "node:assert/strict"
import test from "node:test"
import { redactEvidenceForExport } from "../src/core/redaction.ts"
import {
  EVIDENCE_SCHEMA_VERSION,
  type EvidenceEnvelope
} from "../src/shared/evidence.ts"

test("redactEvidenceForExport redacts sensitive payload fields", () => {
  const record = createEnvelope({
    payload: {
      apiKey: "secret-1",
      api_key: "secret-2",
      token: "secret-3",
      cookie: "secret-4",
      authorization: "Bearer secret-5",
      password: "secret-6",
      secret: "secret-7",
      keep: "visible"
    }
  })

  const redacted = redactEvidenceForExport(record)

  assert.deepEqual(redacted.payload, {
    apiKey: "[REDACTED]",
    api_key: "[REDACTED]",
    token: "[REDACTED]",
    cookie: "[REDACTED]",
    authorization: "[REDACTED]",
    password: "[REDACTED]",
    secret: "[REDACTED]",
    keep: "visible"
  })
  assert.equal(redacted.redaction.applied, true)
  assert.deepEqual(redacted.redaction.fields, [
    "payload.apiKey",
    "payload.api_key",
    "payload.token",
    "payload.cookie",
    "payload.authorization",
    "payload.password",
    "payload.secret",
    "rawSource"
  ])
})

test("redactEvidenceForExport redacts sensitive nested fields", () => {
  const redacted = redactEvidenceForExport(
    createEnvelope({
      payload: {
        nested: {
          token: "secret"
        },
        list: [
          {
            password: "secret"
          }
        ]
      }
    })
  )

  assert.deepEqual(redacted.payload, {
    nested: {
      token: "[REDACTED]"
    },
    list: [
      {
        password: "[REDACTED]"
      }
    ]
  })
  assert.deepEqual(redacted.redaction.fields, [
    "payload.nested.token",
    "payload.list.0.password",
    "rawSource"
  ])
})

test("redactEvidenceForExport redacts common secret field shapes", () => {
  const redacted = redactEvidenceForExport(
    createEnvelope({
      payload: {
        Authorization: "Bearer secret",
        Cookie: "sid=secret",
        accessToken: "access-secret",
        refresh_token: "refresh-secret",
        client_secret: "client-secret",
        credentials: "credential-secret",
        keep: "visible"
      }
    })
  )

  assert.deepEqual(redacted.payload, {
    Authorization: "[REDACTED]",
    Cookie: "[REDACTED]",
    accessToken: "[REDACTED]",
    refresh_token: "[REDACTED]",
    client_secret: "[REDACTED]",
    credentials: "[REDACTED]",
    keep: "visible"
  })
  assert.deepEqual(redacted.redaction.fields, [
    "payload.Authorization",
    "payload.Cookie",
    "payload.accessToken",
    "payload.refresh_token",
    "payload.client_secret",
    "payload.credentials",
    "rawSource"
  ])
})

test("redactEvidenceForExport redacts common secret strings in non-secret fields", () => {
  const redacted = redactEvidenceForExport(
    createEnvelope({
      payload: {
        logs: [
          {
            message: "request failed Authorization: Bearer secret-token"
          },
          {
            details: "retry with api_key=secret-key"
          },
          {
            message: "ordinary token bucket note"
          }
        ]
      }
    })
  )

  assert.deepEqual(redacted.payload, {
    logs: [
      {
        message: "[REDACTED]"
      },
      {
        details: "[REDACTED]"
      },
      {
        message: "ordinary token bucket note"
      }
    ]
  })
  assert.deepEqual(redacted.redaction.fields, [
    "payload.logs.0.message",
    "payload.logs.1.details",
    "rawSource"
  ])
})

test("redactEvidenceForExport redacts secret evidence payloads by default", () => {
  const redacted = redactEvidenceForExport(
    createEnvelope({
      sensitivity: "secret",
      payload: {
        visibleName: "should not export"
      },
      rawSource: {
        diagnostics: {
          status: "available"
        }
      }
    })
  )

  assert.equal(redacted.payload, "[REDACTED]")
  assert.equal(redacted.rawSource, "[REDACTED]")
  assert.deepEqual(redacted.redaction.fields, ["payload", "rawSource"])
})

test("redactEvidenceForExport redacts rawSource by default", () => {
  const redacted = redactEvidenceForExport(
    createEnvelope({
      rawSource: {
        diagnostics: {
          status: "available"
        }
      }
    })
  )

  assert.equal(redacted.rawSource, "[REDACTED]")
  assert.equal(redacted.redaction.applied, true)
  assert.deepEqual(redacted.redaction.fields, ["rawSource"])
})

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
    rawSource: {
      status: "available"
    },
    ...overrides
  }
}
