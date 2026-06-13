import {
  createHanaEventBusAdapter,
  createLogBackedPluginLab,
  createPluginRouteStatus,
  type LogBackedPluginLab,
  type PluginLabActionResult,
  type PluginLabStatus
} from "../index.ts"
import { EvidenceLog } from "../../../core/evidence-log.ts"
import { redactEvidenceForExport } from "../../../core/redaction.ts"
import type { HanaEventBus } from "../../adapter.ts"
import { join } from "node:path"
import {
  EVIDENCE_SCHEMA_VERSION,
  validateEvidenceEnvelope,
  type EvidenceEnvelope
} from "../../../shared/evidence.ts"
import {
  createMyhanakoBootstrap,
  renderMyhanakoAppShell
} from "../../../ui/app-shell.ts"

type HanaRouteApp = {
  get(path: string, handler: HanaRouteHandler): void
  post?(path: string, handler: HanaRouteHandler): void
}

type HanaRouteContext = {
  req: {
    query(name: string): string | undefined
    json?(): Promise<unknown>
  }
  json(value: unknown, status?: number): unknown
  html?(value: string, status?: number): unknown
}

type HanaRouteHandler = (context: HanaRouteContext) => Promise<unknown>

type HanaPluginContext = {
  readonly pluginId: string
  readonly dataDir?: string
  readonly bus?: HanaEventBus
  readonly myhanakoSidecar?: {
    readStatus(pluginId: string): Promise<PluginLabStatus>
    runAction?(input: {
      readonly action: string
      readonly labMode?: boolean
      readonly input?: Record<string, unknown>
    }): Promise<PluginLabActionResult>
  }
}

export default function registerMyhanakoStatusRoute(
  app: HanaRouteApp,
  ctx: HanaPluginContext
): void {
  const sidecar = ctx.myhanakoSidecar ?? createContextBackedSidecar(ctx)

  app.get("/status", async (routeContext) => {
    if (routeContext.req.query("pluginId") === undefined) {
      const html = renderMyhanakoAppShell({
        mode: "embedded",
        bootstrap: createMyhanakoBootstrap({
          pluginId: ctx.pluginId,
          apiBase: `/api/plugins/${ctx.pluginId}`,
          version: "0.1.0"
        })
      })
      return routeContext.html
        ? routeContext.html(html)
        : routeContext.json({ html })
    }

    const targetPluginId = routeContext.req.query("pluginId") ?? ctx.pluginId
    return routeContext.json(
      await createPluginRouteStatus({
        pluginId: ctx.pluginId,
        targetPluginId,
        sidecar
      })
    )
  })

  app.post?.("/lab/actions", async (routeContext) => {
    const body = await readJsonBody(routeContext)
    const action = parseLabActionRequest(body)
    if (!action) {
      return routeContext.json(
        {
          error: "Invalid plugin lab action request body"
        },
        400
      )
    }
    if (!sidecar.runAction) {
      if (ctx.bus && ctx.dataDir) {
        return routeContext.json(
          await runRouteLabAction(
            {
              ...ctx,
              bus: ctx.bus,
              dataDir: ctx.dataDir
            },
            action
          )
        )
      }
      return routeContext.json(
        {
          error: "Plugin lab actions unavailable"
        },
        400
      )
    }
    return routeContext.json(await sidecar.runAction(action))
  })
}

function createContextBackedSidecar(ctx: HanaPluginContext): {
  readStatus(pluginId: string): Promise<PluginLabStatus>
  runAction?: LogBackedPluginLab["runAction"]
} {
  if (!ctx.bus || !ctx.dataDir) {
    return unavailableSidecar()
  }

  return createLogBackedPluginLab({
    adapter: createHanaEventBusAdapter({
      bus: ctx.bus
    }),
    evidenceLog: new EvidenceLog(join(ctx.dataDir, "evidence.jsonl")),
    metadata: {
      hanaVersion: "unknown",
      adapterVersion: "0.1.0",
      probeVersion: "0.1.0",
      idSeed: ctx.pluginId
    }
  })
}

function unavailableSidecar(): {
  readStatus(pluginId: string): Promise<PluginLabStatus>
  runAction(input: {
    readonly action: string
    readonly labMode?: boolean
    readonly input?: Record<string, unknown>
  }): Promise<PluginLabActionResult>
} {
  return {
    async readStatus() {
      throw new Error("sidecar unavailable")
    },
    async runAction() {
      throw new Error("sidecar unavailable")
    }
  }
}

async function runRouteLabAction(
  ctx: HanaPluginContext & {
    readonly bus: HanaEventBus
    readonly dataDir: string
  },
  action: {
    readonly action: string
    readonly labMode?: boolean
    readonly input?: Record<string, unknown>
  }
): Promise<PluginLabActionResult> {
  const log = new EvidenceLog(join(ctx.dataDir, "evidence.jsonl"))
  const records = await log.readAll()
  const sequence = records.reduce(
    (maxSequence, record) => Math.max(maxSequence, record.sequence),
    0
  ) + 1
  const labRunId = `lab_${sanitizeIdSegment(ctx.pluginId)}_${sequence}`
  const eventId = `evt_lab_action_${sanitizeIdSegment(ctx.pluginId)}_${sequence}`
  const actionInput = action.input ?? {}

  if (requiresLabMode(action.action) && action.labMode !== true) {
    const evidence = createRouteLabActionEvidence({
      ctx,
      sequence,
      eventId,
      labRunId,
      action: action.action,
      actionInput,
      status: "denied",
      reason: "Lab mode is required for mutating lab actions"
    })
    await log.append(evidence)
    return {
      status: "denied",
      actionId: labRunId,
      evidenceEventId: eventId,
      reason: "Lab mode is required for mutating lab actions"
    }
  }

  try {
    const request = buildRouteLabActionRequest(ctx, action.action, actionInput)
    const result = await ctx.bus.request(request.capability, request.payload)
    const evidence = createRouteLabActionEvidence({
      ctx,
      sequence,
      eventId,
      labRunId,
      action: action.action,
      actionInput,
      status: "completed",
      capability: request.capability,
      result: request.capability === "plugin.dev.listSurfaces"
        ? {
            surfaces: result
          }
        : result
    })
    await log.append(evidence)
    return {
      status: "completed",
      actionId: labRunId,
      evidenceEventId: eventId,
      capability: request.capability,
      result: request.capability === "plugin.dev.listSurfaces"
        ? {
            surfaces: result
          }
        : result
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    const evidence = createRouteLabActionEvidence({
      ctx,
      sequence,
      eventId,
      labRunId,
      action: action.action,
      actionInput,
      status: "degraded",
      reason
    })
    await log.append(evidence)
    return {
      status: "degraded",
      actionId: labRunId,
      evidenceEventId: eventId,
      reason
    }
  }
}

function buildRouteLabActionRequest(
  ctx: HanaPluginContext,
  action: string,
  input: Record<string, unknown>
): {
  readonly capability: string
  readonly payload: Record<string, unknown>
} {
  switch (action) {
    case "plugin.install_dev":
      return {
        capability: "plugin.dev.install",
        payload: cleanUndefined({
          sourcePath: expectString(input.sourcePath, "sourcePath"),
          pluginId: optionalString(input.pluginId),
          allowFullAccess: optionalBoolean(input.allowFullAccess)
        })
      }
    case "plugin.reload_dev":
      return {
        capability: "plugin.dev.reload",
        payload: cleanUndefined({
          pluginId: expectString(input.pluginId, "pluginId"),
          devRunId: optionalString(input.devRunId),
          allowFullAccess: optionalBoolean(input.allowFullAccess)
        })
      }
    case "plugin.invoke_tool":
      return {
        capability: "plugin.dev.invokeTool",
        payload: cleanUndefined({
          pluginId: expectString(input.pluginId, "pluginId"),
          toolName: expectString(input.toolName, "toolName"),
          input: optionalRecord(input.input),
          sessionPath: optionalString(input.sessionPath),
          agentId: optionalString(input.agentId)
        })
      }
    case "plugin.list_surfaces":
      return {
        capability: "plugin.dev.listSurfaces",
        payload: cleanUndefined({
          pluginId: optionalString(input.pluginId)
        })
      }
    case "session.create_plugin_private":
      return {
        capability: "session:create",
        payload: cleanUndefined({
          ownerPluginId: optionalString(input.ownerPluginId) ?? ctx.pluginId,
          kind: optionalString(input.kind) ?? "myhanako.lab",
          visibility: "plugin_private",
          title: optionalString(input.title),
          agentId: optionalString(input.agentId),
          cwd: optionalString(input.cwd),
          memoryEnabled: optionalBoolean(input.memoryEnabled),
          workspaceFolders: optionalStringArray(input.workspaceFolders),
          thinkingLevel: optionalString(input.thinkingLevel),
          permissionMode: optionalString(input.permissionMode)
        })
      }
    case "session.send_lab_message":
      return {
        capability: "session:send",
        payload: cleanUndefined({
          sessionPath: expectString(input.sessionPath, "sessionPath"),
          text: expectString(input.text, "text"),
          context: optionalRecord(input.context)
        })
      }
    default:
      throw new Error(`Unsupported plugin lab action: ${action}`)
  }
}

function createRouteLabActionEvidence(input: {
  readonly ctx: HanaPluginContext
  readonly sequence: number
  readonly eventId: string
  readonly labRunId: string
  readonly action: string
  readonly actionInput: Record<string, unknown>
  readonly status: PluginLabActionResult["status"]
  readonly capability?: string
  readonly reason?: string
  readonly result?: unknown
}): EvidenceEnvelope {
  const pluginId = optionalString(input.actionInput.pluginId) ?? input.ctx.pluginId
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

  return redactEvidenceForExport(
    validateEvidenceEnvelope({
      schemaVersion: EVIDENCE_SCHEMA_VERSION,
      eventId: input.eventId,
      eventType: `lab.action.${input.status}`,
      timestamp: new Date().toISOString(),
      sequence: input.sequence,
      hanaVersion: "unknown",
      adapterVersion: "0.1.0",
      probeVersion: "0.1.0",
      source: {
        capability: input.capability,
        stability: "experimental",
        layer: "lab"
      },
      refs: {
        pluginId,
        labRunId: input.labRunId
      },
      sensitivity: "internal",
      redaction: {
        applied: false,
        fields: []
      },
      payload
    })
  )
}

function requiresLabMode(action: string): boolean {
  return action !== "plugin.list_surfaces"
}

async function readJsonBody(context: HanaRouteContext): Promise<unknown> {
  if (!context.req.json) {
    return null
  }
  return context.req.json()
}

function parseLabActionRequest(body: unknown): {
  readonly action: string
  readonly labMode?: boolean
  readonly input?: Record<string, unknown>
} | null {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return null
  }
  const record = body as Record<string, unknown>
  if (typeof record.action !== "string") {
    return null
  }
  return {
    action: record.action,
    labMode: typeof record.labMode === "boolean" ? record.labMode : undefined,
    input: record.input !== null &&
      typeof record.input === "object" &&
      !Array.isArray(record.input)
      ? record.input as Record<string, unknown>
      : undefined
  }
}

function cleanUndefined(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined)
  )
}

function expectString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Invalid plugin lab action ${field}`)
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

function sanitizeIdSegment(value: string): string {
  const sanitized = value.replace(/[^A-Za-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "")
  return sanitized.length > 0 ? sanitized : "run"
}
