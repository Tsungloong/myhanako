import assert from "node:assert/strict"
import { mkdtemp, readFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"
import { EvidenceLog } from "../src/core/evidence-log.ts"
import { validateEvidenceEnvelope } from "../src/shared/evidence.ts"

test("validateEvidenceEnvelope accepts a complete P1 evidence envelope", () => {
  const envelope = createEnvelope()

  assert.deepEqual(validateEvidenceEnvelope(envelope), envelope)
})

test("validateEvidenceEnvelope rejects an unknown source layer", () => {
  assert.throws(
    () =>
      validateEvidenceEnvelope(
        createEnvelope({
          source: {
            layer: "desktop"
          }
        })
      ),
    /Invalid evidence source\.layer/
  )
})

test("validateEvidenceEnvelope rejects an unknown sensitivity", () => {
  assert.throws(
    () =>
      validateEvidenceEnvelope({
        ...createEnvelope(),
        sensitivity: "private"
      }),
    /Invalid evidence sensitivity/
  )
})

test("validateEvidenceEnvelope rejects a non-positive sequence", () => {
  assert.throws(
    () =>
      validateEvidenceEnvelope({
        ...createEnvelope(),
        sequence: 0
      }),
    /Invalid evidence sequence/
  )
})

test("validateEvidenceEnvelope rejects an unsupported schema version", () => {
  assert.throws(
    () =>
      validateEvidenceEnvelope({
        ...createEnvelope(),
        schemaVersion: 2
      }),
    /Invalid evidence schemaVersion/
  )
})

test("validateEvidenceEnvelope rejects a missing payload", () => {
  assert.throws(
    () =>
      validateEvidenceEnvelope({
        ...createEnvelope(),
        payload: undefined
      }),
    /Invalid evidence payload/
  )
})

test("validateEvidenceEnvelope rejects non-json payload values", () => {
  assert.throws(
    () =>
      validateEvidenceEnvelope({
        ...createEnvelope(),
        payload: 1n
      }),
    /Invalid evidence payload/
  )
})

test("validateEvidenceEnvelope rejects non-plain object payload values", () => {
  assert.throws(
    () =>
      validateEvidenceEnvelope({
        ...createEnvelope(),
        payload: new Date("2026-06-07T00:00:00.000Z")
      }),
    /Invalid evidence payload/
  )

  assert.throws(
    () =>
      validateEvidenceEnvelope({
        ...createEnvelope(),
        payload: new Map([["status", "available"]])
      }),
    /Invalid evidence payload/
  )
})

test("validateEvidenceEnvelope rejects custom payload serialization", () => {
  const payloadWithHiddenSerializer = {
    status: "available"
  }
  Object.defineProperty(payloadWithHiddenSerializer, "toJSON", {
    value: () => ({
      status: "rewritten"
    })
  })

  assert.throws(
    () =>
      validateEvidenceEnvelope({
        ...createEnvelope(),
        payload: payloadWithHiddenSerializer
      }),
    /Invalid evidence payload/
  )
})

test("validateEvidenceEnvelope rejects hidden or symbol payload keys", () => {
  const payloadWithHiddenKey = {
    status: "available"
  }
  Object.defineProperty(payloadWithHiddenKey, "secret", {
    value: "hidden"
  })

  assert.throws(
    () =>
      validateEvidenceEnvelope({
        ...createEnvelope(),
        payload: payloadWithHiddenKey
      }),
    /Invalid evidence payload/
  )

  assert.throws(
    () =>
      validateEvidenceEnvelope({
        ...createEnvelope(),
        payload: {
          status: "available",
          [Symbol("secret")]: "hidden"
        }
      }),
    /Invalid evidence payload/
  )
})

test("validateEvidenceEnvelope rejects sparse payload arrays", () => {
  const sparsePayload = Array(2) as unknown[]
  sparsePayload[1] = "present"

  assert.throws(
    () =>
      validateEvidenceEnvelope({
        ...createEnvelope(),
        payload: sparsePayload
      }),
    /Invalid evidence payload/
  )
})

test("EvidenceLog writes canonical envelopes without unknown fields", async () => {
  const root = await mkdtemp(join(tmpdir(), "myhanako-evidence-"))
  const logPath = join(root, "evidence.jsonl")
  const log = new EvidenceLog(logPath)

  await log.append({
    ...createEnvelope(),
    apiKey: "secret"
  })

  const rawRecord = JSON.parse(await readFile(logPath, "utf8"))
  assert.equal("apiKey" in rawRecord, false)
})

test("EvidenceLog appends JSONL records and reads them by sequence", async () => {
  const root = await mkdtemp(join(tmpdir(), "myhanako-evidence-"))
  const logPath = join(root, "evidence.jsonl")
  const log = new EvidenceLog(logPath)

  await log.append(createEnvelope({ sequence: 2, eventId: "evt_2" }))
  await log.append(createEnvelope({ sequence: 1, eventId: "evt_1" }))

  const rawLines = (await readFile(logPath, "utf8")).trim().split(/\r?\n/)
  assert.equal(rawLines.length, 2)
  assert.deepEqual(
    rawLines.map((line) => JSON.parse(line).eventId),
    ["evt_2", "evt_1"]
  )

  assert.deepEqual(
    (await log.readAll()).map((record) => record.eventId),
    ["evt_1", "evt_2"]
  )
})

test("EvidenceLog validates records before appending", async () => {
  const root = await mkdtemp(join(tmpdir(), "myhanako-evidence-"))
  const logPath = join(root, "evidence.jsonl")
  const log = new EvidenceLog(logPath)

  await assert.rejects(
    () => log.append(createEnvelope({ sequence: 0 })),
    /Invalid evidence sequence/
  )

  await assert.rejects(readFile(logPath, "utf8"), /ENOENT/)
})

function createEnvelope(overrides: Record<string, unknown> = {}) {
  const envelope = {
    schemaVersion: 1,
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

  if (typeof overrides.source === "object" && overrides.source !== null) {
    envelope.source = {
      ...envelope.source,
      ...overrides.source
    }
  }

  return envelope
}
