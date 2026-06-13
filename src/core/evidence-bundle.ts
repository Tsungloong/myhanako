import {
  redactEvidenceForExport
} from "./redaction.ts"
import type { EvidenceEnvelope } from "../shared/evidence.ts"

export interface EvidenceBundleReader {
  readAll(): Promise<readonly EvidenceEnvelope[]>
}

export type EvidenceBundle = {
  readonly schemaVersion: 1
  readonly bundleId: string
  readonly createdAt: string
  readonly filters: {
    readonly sessionId?: string
    readonly pluginId?: string
  }
  readonly redacted: true
  readonly recordCount: number
  readonly manifest: {
    readonly evidenceRefs: readonly string[]
    readonly redactionFields: readonly string[]
  }
  readonly records: readonly EvidenceEnvelope[]
}

export type BuildEvidenceBundleInput = {
  readonly evidenceReader: EvidenceBundleReader
  readonly sessionId?: string
  readonly pluginId?: string
  readonly createdAt?: string
  readonly bundleId?: string
}

export async function buildEvidenceBundle(
  input: BuildEvidenceBundleInput
): Promise<EvidenceBundle> {
  const records = (await input.evidenceReader.readAll())
    .filter((record) => input.sessionId === undefined || record.refs.sessionPath === input.sessionId)
    .filter((record) => input.pluginId === undefined || record.refs.pluginId === input.pluginId)
    .sort((left, right) => left.sequence - right.sequence)
    .map((record) => redactEvidenceForExport(record))

  return {
    schemaVersion: 1,
    bundleId: input.bundleId ?? createBundleId(),
    createdAt: input.createdAt ?? new Date().toISOString(),
    filters: cleanFilter({
      sessionId: input.sessionId,
      pluginId: input.pluginId
    }),
    redacted: true,
    recordCount: records.length,
    manifest: {
      evidenceRefs: records.map((record) => record.eventId),
      redactionFields: unique(records.flatMap((record) => record.redaction.fields))
    },
    records
  }
}

function cleanFilter(input: {
  readonly sessionId?: string
  readonly pluginId?: string
}): EvidenceBundle["filters"] {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined)
  )
}

function unique(values: readonly string[]): readonly string[] {
  return [...new Set(values)]
}

function createBundleId(): string {
  return `bundle_${Date.now().toString(36)}`
}
