import {
  validateEvidenceEnvelope,
  type EvidenceEnvelope,
  type EvidenceJsonArray,
  type EvidenceJsonObject,
  type EvidenceJsonValue
} from "../shared/evidence.ts"

const REDACTED_VALUE = "[REDACTED]"
const SENSITIVE_FIELD_PATTERN =
  /api[-_]?key|access[-_]?token|refresh[-_]?token|token|secret|client[-_]?secret|password|authorization|credential|cookie|set[-_]?cookie|private[-_]?key/i
const SENSITIVE_STRING_PATTERN =
  /\b(?:authorization\s*:\s*bearer\s+\S+|bearer\s+\S+|api[-_ ]?key\s*[:=]\s*\S+|access[-_ ]?token\s*[:=]\s*\S+|refresh[-_ ]?token\s*[:=]\s*\S+|token\s*[:=]\s*\S+|secret\s*[:=]\s*\S+|password\s*[:=]\s*\S+|cookie\s*[:=]\s*\S+|credential\s*[:=]\s*\S+|-----BEGIN [A-Z ]*PRIVATE KEY-----)/i
const WINDOWS_USER_PATH_PATTERN = /\b([A-Za-z]:\\Users\\)([^\\/:*?"<>|\r\n]+)(?=\\)/g
const UNIX_USER_PATH_PATTERN = /\/(Users|home)\/([^/\s]+)(?=\/)/g

export function redactEvidenceForExport(record: EvidenceEnvelope): EvidenceEnvelope {
  const envelope = validateEvidenceEnvelope(record)
  const fields: string[] = []
  const payload =
    envelope.sensitivity === "secret"
      ? redactSecretPayload(fields)
      : redactValue(envelope.payload, "payload", fields)
  const redacted: EvidenceEnvelope = {
    ...envelope,
    payload,
    redaction: {
      applied: false,
      fields: []
    }
  }

  if ("rawSource" in envelope) {
    redacted.rawSource = REDACTED_VALUE
    fields.push("rawSource")
  }

  redacted.redaction = {
    applied: fields.length > 0,
    fields
  }
  return validateEvidenceEnvelope(redacted)
}

function redactValue(
  value: EvidenceJsonValue,
  path: string,
  fields: string[]
): EvidenceJsonValue {
  if (typeof value === "string") {
    const redactedString = redactString(value)
    if (redactedString.redacted) {
      fields.push(path)
      return redactedString.value
    }
    return value
  }

  if (isEvidenceJsonArray(value)) {
    return value.map((item, index) => redactValue(item, `${path}.${index}`, fields))
  }

  if (isEvidenceJsonObject(value)) {
    return redactObject(value, path, fields)
  }

  return value
}

function redactObject(
  value: EvidenceJsonObject,
  path: string,
  fields: string[]
): EvidenceJsonObject {
  const redacted: Record<string, EvidenceJsonValue> = {}
  for (const [key, item] of Object.entries(value)) {
    const itemPath = `${path}.${key}`
    if (isSensitiveFieldName(key)) {
      redacted[key] = REDACTED_VALUE
      fields.push(itemPath)
      continue
    }
    redacted[key] = redactValue(item, itemPath, fields)
  }
  return redacted
}

function redactSecretPayload(fields: string[]): EvidenceJsonValue {
  fields.push("payload")
  return REDACTED_VALUE
}

function isSensitiveFieldName(key: string): boolean {
  return SENSITIVE_FIELD_PATTERN.test(key)
}

function isSensitiveStringValue(value: string): boolean {
  return SENSITIVE_STRING_PATTERN.test(value)
}

function redactString(value: string): { readonly redacted: boolean; readonly value: string } {
  if (isSensitiveStringValue(value)) {
    return {
      redacted: true,
      value: REDACTED_VALUE
    }
  }

  const pathRedacted = value
    .replace(WINDOWS_USER_PATH_PATTERN, "$1[REDACTED]")
    .replace(UNIX_USER_PATH_PATTERN, "/$1/[REDACTED]")

  return {
    redacted: pathRedacted !== value,
    value: pathRedacted
  }
}

function isEvidenceJsonArray(value: EvidenceJsonValue): value is EvidenceJsonArray {
  return Array.isArray(value)
}

function isEvidenceJsonObject(value: EvidenceJsonValue): value is EvidenceJsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}
