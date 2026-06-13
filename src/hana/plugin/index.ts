import {
  HanaAdapter,
  PLUGIN_DIAGNOSTICS_CAPABILITY,
  type HanaEventBus,
  type DevPluginInstallInput,
  type DevPluginInvokeToolInput,
  type DevPluginReloadInput,
  type HanaActionResult,
  type HanaCapabilityStability,
  type ListPluginSurfacesInput,
  type PluginPrivateSessionCreateInput,
  type PluginPrivateSessionMessageInput,
  type PluginDiagnosticsResult,
  type PluginSurfacesResult
} from "../adapter.ts"
import type { EvidenceSink } from "../../server/api.ts"
import { redactEvidenceForExport } from "../../core/redaction.ts"
import {
  EVIDENCE_SCHEMA_VERSION,
  validateEvidenceEnvelope,
  type EvidenceEnvelope
} from "../../shared/evidence.ts"

export interface PluginDiagnosticsReader {
  readPluginDiagnostics(pluginId: string): Promise<PluginDiagnosticsResult>
}

export interface PluginLabAdapter extends PluginDiagnosticsReader {
  installDevPlugin(input: DevPluginInstallInput): Promise<HanaActionResult>
  reloadDevPlugin(input: DevPluginReloadInput): Promise<HanaActionResult>
  invokePluginTool(input: DevPluginInvokeToolInput): Promise<HanaActionResult>
  listPluginSurfaces(input: ListPluginSurfacesInput): Promise<PluginSurfacesResult>
  createPluginPrivateSession(input: PluginPrivateSessionCreateInput): Promise<HanaActionResult>
  sendPluginPrivateSessionMessage(input: PluginPrivateSessionMessageInput): Promise<HanaActionResult>
}

export type HanaPluginBusContext = {
  readonly bus: HanaEventBus
}

export function createHanaEventBusAdapter(
  context: HanaPluginBusContext
): HanaAdapter {
  return new HanaAdapter({
    eventBus: context.bus
  })
}

export type PluginLabMetadata = {
  readonly pluginId: string
  readonly eventId: string
  readonly sequence: number
  readonly labRunId?: string
  readonly sessionPath?: string
  readonly hanaVersion: string
  readonly hanaPluginProtocolVersion?: number
  readonly adapterVersion: string
  readonly probeVersion: string
  readonly piSdkVersion?: string
  readonly timestamp?: string
}

export type RunPluginDiagnosticsLabInput = {
  readonly adapter: PluginDiagnosticsReader
  readonly evidenceSink: EvidenceSink
  readonly metadata: PluginLabMetadata
  readonly redact?: boolean
}

export type PluginLabStatus =
  | {
      readonly status: "available"
      readonly evidenceEventId: string
    }
  | {
      readonly status: "unavailable" | "degraded"
      readonly reason: string
      readonly evidenceEventId?: string
    }

export async function runPluginDiagnosticsLab(
  input: RunPluginDiagnosticsLabInput
): Promise<PluginLabStatus> {
  try {
    const diagnostics = await input.adapter.readPluginDiagnostics(input.metadata.pluginId)
    const evidence = input.redact === true
      ? redactEvidenceForExport(createPluginDiagnosticsEvidence(diagnostics, input.metadata))
      : createPluginDiagnosticsEvidence(diagnostics, input.metadata)
    await input.evidenceSink.append(evidence)

    if (diagnostics.status === "available") {
      return {
        status: "available",
        evidenceEventId: evidence.eventId
      }
    }

    return {
      status: diagnostics.status,
      reason: diagnostics.reason,
      evidenceEventId: evidence.eventId
    }
  } catch (error) {
    return {
      status: "degraded",
      reason: error instanceof Error ? error.message : String(error)
    }
  }
}

export interface PluginLabEvidenceStore extends EvidenceSink {
  readAll(): Promise<readonly EvidenceEnvelope[]>
}

export type LogBackedPluginLabMetadata = {
  readonly hostPluginId?: string
  readonly hanaVersion: string
  readonly hanaPluginProtocolVersion?: number
  readonly adapterVersion: string
  readonly probeVersion: string
  readonly piSdkVersion?: string
  readonly sessionPath?: string
  readonly timestamp?: () => string
  readonly idSeed?: string
}

export type LogBackedPluginLabOptions = {
  readonly adapter: PluginLabAdapter
  readonly evidenceLog: PluginLabEvidenceStore
  readonly metadata: LogBackedPluginLabMetadata
}

export type PluginLabActionName =
  | "plugin.install_dev"
  | "plugin.reload_dev"
  | "plugin.invoke_tool"
  | "plugin.list_surfaces"
  | "session.create_plugin_private"
  | "session.send_lab_message"

export type RunPluginLabActionInput = {
  readonly action: PluginLabActionName
  readonly labMode?: boolean
  readonly input?: Record<string, unknown>
}

export type PluginLabActionResult =
  | {
      readonly status: "completed"
      readonly actionId: string
      readonly evidenceEventId: string
      readonly capability: string
      readonly result: unknown
    }
  | {
      readonly status: "unavailable" | "degraded" | "denied"
      readonly actionId: string
      readonly evidenceEventId: string
      readonly capability?: string
      readonly reason: string
    }

export type LogBackedPluginLab = {
  readStatus(pluginId: string): Promise<PluginLabStatus>
  runAction(input: RunPluginLabActionInput): Promise<PluginLabActionResult>
}

export function createLogBackedPluginLab(
  options: LogBackedPluginLabOptions
): LogBackedPluginLab {
  let queue: Promise<unknown> = Promise.resolve()

  async function runExclusive<T>(operation: () => Promise<T>): Promise<T> {
    const run = queue.then(operation)
    queue = run.catch(() => undefined)
    return run
  }

  return {
    async readStatus(pluginId: string): Promise<PluginLabStatus> {
      return runExclusive(async () => {
        const sequence = await nextEvidenceSequence(options.evidenceLog)
        const runId = createRunId(options.metadata.idSeed, sequence)
        return runPluginDiagnosticsLab({
          adapter: options.adapter,
          evidenceSink: options.evidenceLog,
          redact: true,
          metadata: {
            pluginId,
            eventId: `evt_plugin_diagnostics_${runId}`,
            sequence,
            labRunId: `lab_${runId}`,
            sessionPath: options.metadata.sessionPath,
            hanaVersion: options.metadata.hanaVersion,
            hanaPluginProtocolVersion: options.metadata.hanaPluginProtocolVersion,
            adapterVersion: options.metadata.adapterVersion,
            probeVersion: options.metadata.probeVersion,
            piSdkVersion: options.metadata.piSdkVersion,
            timestamp: options.metadata.timestamp?.()
          }
        })
      })
    },
    async runAction(input: RunPluginLabActionInput): Promise<PluginLabActionResult> {
      return runExclusive(async () => {
        const sequence = await nextEvidenceSequence(options.evidenceLog)
        const runId = createRunId(options.metadata.idSeed, sequence)
        return runPluginLabAction({
          adapter: options.adapter,
          evidenceSink: options.evidenceLog,
          metadata: {
            hostPluginId: options.metadata.hostPluginId,
            hanaVersion: options.metadata.hanaVersion,
            hanaPluginProtocolVersion: options.metadata.hanaPluginProtocolVersion,
            adapterVersion: options.metadata.adapterVersion,
            probeVersion: options.metadata.probeVersion,
            piSdkVersion: options.metadata.piSdkVersion,
            sessionPath: options.metadata.sessionPath,
            timestamp: options.metadata.timestamp?.(),
            eventId: `evt_lab_action_${runId}`,
            sequence,
            labRunId: `lab_${runId}`
          },
          actionInput: input
        })
      })
    }
  }
}

type RunPluginLabActionInternalInput = {
  readonly adapter: PluginLabAdapter
  readonly evidenceSink: EvidenceSink
  readonly metadata: PluginLabActionMetadata
  readonly actionInput: RunPluginLabActionInput
}

type PluginLabActionMetadata = {
  readonly hostPluginId?: string
  readonly eventId: string
  readonly sequence: number
  readonly labRunId: string
  readonly sessionPath?: string
  readonly hanaVersion: string
  readonly hanaPluginProtocolVersion?: number
  readonly adapterVersion: string
  readonly probeVersion: string
  readonly piSdkVersion?: string
  readonly timestamp?: string
}

async function runPluginLabAction(
  input: RunPluginLabActionInternalInput
): Promise<PluginLabActionResult> {
  const actionInput = normalizeActionInput(input.actionInput.input)
  const actionId = input.metadata.labRunId

  if (requiresLabMode(input.actionInput.action) && input.actionInput.labMode !== true) {
    const denied = {
      status: "denied",
      reason: "Lab mode is required for mutating lab actions"
    } as const
    const evidence = createLabActionEvidence({
      metadata: input.metadata,
      action: input.actionInput.action,
      actionInput,
      status: denied.status,
      reason: denied.reason
    })
    await input.evidenceSink.append(evidence)
    return {
      actionId,
      evidenceEventId: evidence.eventId,
      ...denied
    }
  }

  try {
    const actionResult = await dispatchPluginLabAction({
      adapter: input.adapter,
      hostPluginId: input.metadata.hostPluginId,
      action: input.actionInput.action,
      actionInput
    })

    if (actionResult.status === "completed") {
      const resultPayload = "result" in actionResult
        ? actionResult.result
        : {
            surfaces: actionResult.surfaces
          }
      const evidence = createLabActionEvidence({
        metadata: input.metadata,
        action: input.actionInput.action,
        actionInput,
        status: actionResult.status,
        capability: actionResult.capability,
        result: resultPayload
      })
      await input.evidenceSink.append(evidence)
      return {
        status: "completed",
        actionId,
        evidenceEventId: evidence.eventId,
        capability: actionResult.capability,
        result: resultPayload
      }
    }

    const evidence = createLabActionEvidence({
      metadata: input.metadata,
      action: input.actionInput.action,
      actionInput,
      status: actionResult.status,
      capability: actionResult.capability,
      reason: actionResult.reason
    })
    await input.evidenceSink.append(evidence)
    return {
      status: actionResult.status,
      actionId,
      evidenceEventId: evidence.eventId,
      capability: actionResult.capability,
      reason: actionResult.reason
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    const evidence = createLabActionEvidence({
      metadata: input.metadata,
      action: input.actionInput.action,
      actionInput,
      status: "degraded",
      reason
    })
    await input.evidenceSink.append(evidence)
    return {
      status: "degraded",
      actionId,
      evidenceEventId: evidence.eventId,
      reason
    }
  }
}

async function dispatchPluginLabAction(input: {
  readonly adapter: PluginLabAdapter
  readonly hostPluginId?: string
  readonly action: PluginLabActionName
  readonly actionInput: Record<string, unknown>
}): Promise<HanaActionResult | PluginSurfacesResult> {
  switch (input.action) {
    case "plugin.install_dev":
      return input.adapter.installDevPlugin(cleanUndefined({
        sourcePath: expectString(input.actionInput.sourcePath, "sourcePath"),
        pluginId: optionalString(input.actionInput.pluginId),
        allowFullAccess: optionalBoolean(input.actionInput.allowFullAccess)
      }) as DevPluginInstallInput)
    case "plugin.reload_dev":
      return input.adapter.reloadDevPlugin(cleanUndefined({
        pluginId: expectString(input.actionInput.pluginId, "pluginId"),
        devRunId: optionalString(input.actionInput.devRunId),
        allowFullAccess: optionalBoolean(input.actionInput.allowFullAccess)
      }) as DevPluginReloadInput)
    case "plugin.invoke_tool":
      return input.adapter.invokePluginTool(cleanUndefined({
        pluginId: expectString(input.actionInput.pluginId, "pluginId"),
        toolName: expectString(input.actionInput.toolName, "toolName"),
        input: optionalRecord(input.actionInput.input),
        sessionPath: optionalString(input.actionInput.sessionPath),
        agentId: optionalString(input.actionInput.agentId)
      }) as DevPluginInvokeToolInput)
    case "plugin.list_surfaces":
      return input.adapter.listPluginSurfaces(cleanUndefined({
        pluginId: optionalString(input.actionInput.pluginId)
      }) as ListPluginSurfacesInput)
    case "session.create_plugin_private":
      return input.adapter.createPluginPrivateSession(cleanUndefined({
        ownerPluginId: optionalString(input.actionInput.ownerPluginId) ??
          input.hostPluginId ??
          "myhanako",
        kind: optionalString(input.actionInput.kind) ?? "myhanako.lab",
        visibility: "plugin_private",
        title: optionalString(input.actionInput.title),
        agentId: optionalString(input.actionInput.agentId),
        cwd: optionalString(input.actionInput.cwd),
        memoryEnabled: optionalBoolean(input.actionInput.memoryEnabled),
        workspaceFolders: optionalStringArray(input.actionInput.workspaceFolders),
        thinkingLevel: optionalString(input.actionInput.thinkingLevel),
        permissionMode: optionalString(input.actionInput.permissionMode)
      }) as PluginPrivateSessionCreateInput)
    case "session.send_lab_message":
      return input.adapter.sendPluginPrivateSessionMessage(cleanUndefined({
        sessionPath: expectString(input.actionInput.sessionPath, "sessionPath"),
        text: expectString(input.actionInput.text, "text"),
        context: optionalSessionContext(input.actionInput.context)
      }) as PluginPrivateSessionMessageInput)
  }
}

export type PluginRouteStatus =
  | {
      readonly hostPluginId: string
      readonly targetPluginId: string
      readonly pluginId: string
      readonly status: "available"
      readonly evidenceEventId?: string
    }
  | {
      readonly hostPluginId: string
      readonly targetPluginId: string
      readonly pluginId: string
      readonly status: "unavailable" | "degraded"
      readonly reason: string
      readonly evidenceEventId?: string
    }

export type CreatePluginRouteStatusInput = {
  readonly pluginId: string
  readonly targetPluginId?: string
  readonly sidecar: {
    readStatus(pluginId: string): Promise<PluginLabStatus>
  }
}

export async function createPluginRouteStatus(
  input: CreatePluginRouteStatusInput
): Promise<PluginRouteStatus> {
  const targetPluginId = input.targetPluginId ?? input.pluginId
  try {
    const labStatus = await input.sidecar.readStatus(targetPluginId)
    return {
      hostPluginId: input.pluginId,
      targetPluginId,
      pluginId: targetPluginId,
      ...labStatus
    }
  } catch (error) {
    return {
      hostPluginId: input.pluginId,
      targetPluginId,
      pluginId: targetPluginId,
      status: "degraded",
      reason: error instanceof Error ? error.message : String(error)
    }
  }
}

function createPluginDiagnosticsEvidence(
  diagnostics: PluginDiagnosticsResult,
  metadata: PluginLabMetadata
): EvidenceEnvelope {
  const refs: EvidenceEnvelope["refs"] = {
    pluginId: metadata.pluginId
  }
  if (metadata.sessionPath !== undefined) {
    refs.sessionPath = metadata.sessionPath
  }
  if (metadata.labRunId !== undefined) {
    refs.labRunId = metadata.labRunId
  }

  const common = {
    schemaVersion: EVIDENCE_SCHEMA_VERSION,
    eventId: metadata.eventId,
    eventType: "plugin.diagnostics.read",
    timestamp: metadata.timestamp ?? new Date().toISOString(),
    sequence: metadata.sequence,
    hanaVersion: metadata.hanaVersion,
    adapterVersion: metadata.adapterVersion,
    probeVersion: metadata.probeVersion,
    source: {
      capability: PLUGIN_DIAGNOSTICS_CAPABILITY,
      stability: toEvidenceStability(diagnostics.stability),
      layer: "plugin"
    },
    refs,
    sensitivity: "internal",
    redaction: {
      applied: false,
      fields: []
    }
  } satisfies Omit<EvidenceEnvelope, "payload">

  const envelope: Record<string, unknown> =
    diagnostics.status === "available"
      ? {
          ...common,
          payload: {
            status: diagnostics.status,
            diagnostics: diagnostics.diagnostics
          },
          rawSource: diagnostics.diagnostics
        }
      : {
          ...common,
          payload: {
            status: diagnostics.status,
            reason: diagnostics.reason
          }
        }

  if (metadata.hanaPluginProtocolVersion !== undefined) {
    envelope.hanaPluginProtocolVersion = metadata.hanaPluginProtocolVersion
  }
  if (metadata.piSdkVersion !== undefined) {
    envelope.piSdkVersion = metadata.piSdkVersion
  }

  return validateEvidenceEnvelope(envelope)
}

function createLabActionEvidence(input: {
  readonly metadata: PluginLabActionMetadata
  readonly action: PluginLabActionName
  readonly actionInput: Record<string, unknown>
  readonly status: PluginLabActionResult["status"]
  readonly capability?: string
  readonly reason?: string
  readonly result?: unknown
}): EvidenceEnvelope {
  const refs: EvidenceEnvelope["refs"] = {
    labRunId: input.metadata.labRunId
  }
  const pluginId = firstStringValue(input.actionInput.pluginId) ??
    input.metadata.hostPluginId
  if (pluginId !== undefined) {
    refs.pluginId = pluginId
  }
  if (input.metadata.sessionPath !== undefined) {
    refs.sessionPath = input.metadata.sessionPath
  }

  const payload: Record<string, unknown> = {
    action: input.action,
    status: input.status,
    input: input.actionInput
  }
  if (input.reason !== undefined) {
    payload.reason = input.reason
  }
  if (input.result !== undefined) {
    payload.result = input.result
  }

  const envelope: Record<string, unknown> = {
    schemaVersion: EVIDENCE_SCHEMA_VERSION,
    eventId: input.metadata.eventId,
    eventType: `lab.action.${input.status}`,
    timestamp: input.metadata.timestamp ?? new Date().toISOString(),
    sequence: input.metadata.sequence,
    hanaVersion: input.metadata.hanaVersion,
    adapterVersion: input.metadata.adapterVersion,
    probeVersion: input.metadata.probeVersion,
    source: {
      capability: input.capability,
      stability: "experimental",
      layer: "lab"
    },
    refs,
    sensitivity: "internal",
    redaction: {
      applied: false,
      fields: []
    },
    payload
  }

  if (input.metadata.hanaPluginProtocolVersion !== undefined) {
    envelope.hanaPluginProtocolVersion = input.metadata.hanaPluginProtocolVersion
  }
  if (input.metadata.piSdkVersion !== undefined) {
    envelope.piSdkVersion = input.metadata.piSdkVersion
  }

  return redactEvidenceForExport(validateEvidenceEnvelope(envelope))
}

async function nextEvidenceSequence(
  evidenceLog: PluginLabEvidenceStore
): Promise<number> {
  const records = await evidenceLog.readAll()
  return records.reduce(
    (maxSequence, record) => Math.max(maxSequence, record.sequence),
    0
  ) + 1
}

function createRunId(idSeed: string | undefined, runCounter: number): string {
  return `${sanitizeIdSegment(idSeed ?? "run")}_${runCounter}`
}

function sanitizeIdSegment(value: string): string {
  const sanitized = value.replace(/[^A-Za-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "")
  return sanitized.length > 0 ? sanitized : "run"
}

function toEvidenceStability(
  stability: HanaCapabilityStability | undefined
): EvidenceEnvelope["source"]["stability"] {
  return stability ?? "experimental"
}

function requiresLabMode(action: PluginLabActionName): boolean {
  return action !== "plugin.list_surfaces"
}

function normalizeActionInput(input: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!input) {
    return {}
  }
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined)
  )
}

function cleanUndefined(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined)
  )
}

function expectString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Invalid lab action ${field}`)
  }
  return value
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0
    ? value
    : undefined
}

function optionalBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean"
    ? value
    : undefined
}

function optionalRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function optionalStringArray(value: unknown): readonly string[] | undefined {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
    ? value
    : undefined
}

function optionalSessionContext(value: unknown): PluginPrivateSessionMessageInput["context"] {
  const record = optionalRecord(value)
  if (!record) {
    return undefined
  }
  const context = Object.fromEntries(
    Object.entries({
      system: optionalString(record.system),
      beforeUser: optionalString(record.beforeUser),
      afterUser: optionalString(record.afterUser)
    }).filter(([, item]) => item !== undefined)
  ) as NonNullable<PluginPrivateSessionMessageInput["context"]>
  return Object.keys(context).length > 0 ? context : undefined
}

function firstStringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0
    ? value
    : undefined
}
