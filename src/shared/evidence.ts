export type EvidenceLayer =
  | "session"
  | "plugin"
  | "tool"
  | "prompt"
  | "pipeline"
  | "permission"
  | "workflow"
  | "lab"

export type EvidenceSensitivity =
  | "public"
  | "internal"
  | "secret-adjacent"
  | "secret"

export type EvidenceJsonPrimitive = string | number | boolean | null
export type EvidenceJsonValue =
  | EvidenceJsonPrimitive
  | EvidenceJsonObject
  | EvidenceJsonArray
export type EvidenceJsonObject = { readonly [key: string]: EvidenceJsonValue }
export type EvidenceJsonArray = readonly EvidenceJsonValue[]

export const EVIDENCE_SCHEMA_VERSION = 1

export type EvidenceEnvelope = {
  schemaVersion: typeof EVIDENCE_SCHEMA_VERSION
  eventId: string
  eventType: string
  timestamp: string
  sequence: number
  hanaVersion: string
  hanaPluginProtocolVersion?: number
  adapterVersion: string
  probeVersion: string
  piSdkVersion?: string
  source: {
    capability?: string
    stability?: "stable" | "experimental" | "unknown"
    layer: EvidenceLayer
  }
  refs: {
    sessionPath?: string
    turnId?: string
    toolCallId?: string
    pluginId?: string
    labRunId?: string
    workflowId?: string
  }
  sensitivity: EvidenceSensitivity
  redaction: {
    applied: boolean
    fields: string[]
  }
  payload: EvidenceJsonValue
  rawSource?: EvidenceJsonValue
}

const REF_KEYS = [
  "sessionPath",
  "turnId",
  "toolCallId",
  "pluginId",
  "labRunId",
  "workflowId"
] as const

const EVIDENCE_LAYERS = new Set<EvidenceLayer>([
  "session",
  "plugin",
  "tool",
  "prompt",
  "pipeline",
  "permission",
  "workflow",
  "lab"
])

const EVIDENCE_SENSITIVITIES = new Set<EvidenceSensitivity>([
  "public",
  "internal",
  "secret-adjacent",
  "secret"
])

const SOURCE_STABILITIES = new Set(["stable", "experimental", "unknown"])

export function validateEvidenceEnvelope(input: unknown): EvidenceEnvelope {
  const envelope = expectRecord(input, "EvidenceEnvelope")

  if (envelope.schemaVersion !== EVIDENCE_SCHEMA_VERSION) {
    throw new Error("Invalid evidence schemaVersion")
  }
  expectString(envelope.eventId, "eventId")
  expectString(envelope.eventType, "eventType")
  expectString(envelope.timestamp, "timestamp")
  expectPositiveInteger(envelope.sequence, "sequence")
  expectString(envelope.hanaVersion, "hanaVersion")
  expectOptionalNumber(
    envelope.hanaPluginProtocolVersion,
    "hanaPluginProtocolVersion"
  )
  expectString(envelope.adapterVersion, "adapterVersion")
  expectString(envelope.probeVersion, "probeVersion")
  expectOptionalString(envelope.piSdkVersion, "piSdkVersion")

  const source = expectRecord(envelope.source, "source")
  expectOptionalString(source.capability, "source.capability")
  if (
    source.stability !== undefined &&
    (typeof source.stability !== "string" || !SOURCE_STABILITIES.has(source.stability))
  ) {
    throw new Error("Invalid evidence source.stability")
  }
  if (!EVIDENCE_LAYERS.has(source.layer as EvidenceLayer)) {
    throw new Error("Invalid evidence source.layer")
  }

  const refs = expectRecord(envelope.refs, "refs")
  for (const key of REF_KEYS) {
    expectOptionalString(refs[key], `refs.${key}`)
  }

  if (!EVIDENCE_SENSITIVITIES.has(envelope.sensitivity as EvidenceSensitivity)) {
    throw new Error("Invalid evidence sensitivity")
  }

  const redaction = expectRecord(envelope.redaction, "redaction")
  if (typeof redaction.applied !== "boolean") {
    throw new Error("Invalid evidence redaction.applied")
  }
  if (
    !Array.isArray(redaction.fields) ||
    !redaction.fields.every((field) => typeof field === "string")
  ) {
    throw new Error("Invalid evidence redaction.fields")
  }
  if (!("payload" in envelope)) {
    throw new Error("Missing evidence payload")
  }
  const payload = canonicalizeJsonValue(envelope.payload, "payload")
  let rawSource: EvidenceJsonValue | undefined
  if ("rawSource" in envelope) {
    rawSource = canonicalizeJsonValue(envelope.rawSource, "rawSource")
  }

  const canonicalRefs = Object.fromEntries(
    REF_KEYS.flatMap((key) =>
      refs[key] === undefined ? [] : [[key, refs[key]]]
    )
  ) as EvidenceEnvelope["refs"]
  const canonicalSource: EvidenceEnvelope["source"] = {
    layer: source.layer as EvidenceLayer
  }
  if (source.capability !== undefined) {
    canonicalSource.capability = source.capability as string
  }
  if (source.stability !== undefined) {
    canonicalSource.stability = source.stability as EvidenceEnvelope["source"]["stability"]
  }

  const canonicalEnvelope: EvidenceEnvelope = {
    schemaVersion: EVIDENCE_SCHEMA_VERSION,
    eventId: envelope.eventId as string,
    eventType: envelope.eventType as string,
    timestamp: envelope.timestamp as string,
    sequence: envelope.sequence as number,
    hanaVersion: envelope.hanaVersion as string,
    adapterVersion: envelope.adapterVersion as string,
    probeVersion: envelope.probeVersion as string,
    source: canonicalSource,
    refs: canonicalRefs,
    sensitivity: envelope.sensitivity as EvidenceSensitivity,
    redaction: {
      applied: redaction.applied as boolean,
      fields: [...(redaction.fields as string[])]
    },
    payload
  }
  if (envelope.hanaPluginProtocolVersion !== undefined) {
    canonicalEnvelope.hanaPluginProtocolVersion =
      envelope.hanaPluginProtocolVersion as number
  }
  if (envelope.piSdkVersion !== undefined) {
    canonicalEnvelope.piSdkVersion = envelope.piSdkVersion as string
  }
  if ("rawSource" in envelope) {
    canonicalEnvelope.rawSource = rawSource
  }

  return canonicalEnvelope
}

function expectRecord(value: unknown, field: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Invalid evidence ${field}`)
  }

  return value as Record<string, unknown>
}

function expectString(value: unknown, field: string): void {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Invalid evidence ${field}`)
  }
}

function expectOptionalString(value: unknown, field: string): void {
  if (value !== undefined && typeof value !== "string") {
    throw new Error(`Invalid evidence ${field}`)
  }
}

function expectNumber(value: unknown, field: string): void {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Invalid evidence ${field}`)
  }
}

function expectOptionalNumber(value: unknown, field: string): void {
  if (value !== undefined) {
    expectNumber(value, field)
  }
}

function expectPositiveInteger(value: unknown, field: string): void {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 1
  ) {
    throw new Error(`Invalid evidence ${field}`)
  }
}

function canonicalizeJsonValue(value: unknown, field: string): EvidenceJsonValue {
  return copyJsonValue(value, field, new Set<object>())
}

function copyJsonValue(value: unknown, field: string, seen: Set<object>): EvidenceJsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error(`Invalid evidence ${field}`)
    }
    return value
  }

  if (typeof value !== "object") {
    throw new Error(`Invalid evidence ${field}`)
  }

  if (seen.has(value)) {
    throw new Error(`Invalid evidence ${field}`)
  }
  if (!Array.isArray(value) && !isPlainJsonObject(value)) {
    throw new Error(`Invalid evidence ${field}`)
  }
  seen.add(value)

  if (Array.isArray(value)) {
    assertArrayJsonShape(value, field)
    const copied: EvidenceJsonValue[] = []
    for (let index = 0; index < value.length; index += 1) {
      if (!(index in value)) {
        throw new Error(`Invalid evidence ${field}`)
      }
      copied.push(copyJsonValue(value[index], `${field}.${index}`, seen))
    }
    seen.delete(value)
    return copied
  }

  assertObjectJsonShape(value, field)
  const copied: Record<string, EvidenceJsonValue> = {}
  for (const [key, item] of Object.entries(value)) {
    copied[key] = copyJsonValue(item, `${field}.${key}`, seen)
  }
  seen.delete(value)
  return copied
}

function isPlainJsonObject(value: object): boolean {
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function assertObjectJsonShape(value: object, field: string): void {
  const ownKeys = Reflect.ownKeys(value)
  const enumerableKeys = new Set(Object.keys(value))
  for (const key of ownKeys) {
    if (typeof key === "symbol" || !enumerableKeys.has(key)) {
      throw new Error(`Invalid evidence ${field}`)
    }
  }
}

function assertArrayJsonShape(value: unknown[], field: string): void {
  const ownKeys = Reflect.ownKeys(value)
  for (const key of ownKeys) {
    if (key === "length") {
      continue
    }
    if (typeof key === "symbol" || !isArrayIndexKey(key, value.length)) {
      throw new Error(`Invalid evidence ${field}`)
    }
  }
}

function isArrayIndexKey(key: string, length: number): boolean {
  if (!/^(0|[1-9]\d*)$/.test(key)) {
    return false
  }
  const index = Number(key)
  return Number.isSafeInteger(index) && index >= 0 && index < length
}
