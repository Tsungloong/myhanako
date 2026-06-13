export const PLUGIN_DIAGNOSTICS_CAPABILITY = "plugin.dev.diagnostics"
export const PLUGIN_DEV_INSTALL_CAPABILITY = "plugin.dev.install"
export const PLUGIN_DEV_RELOAD_CAPABILITY = "plugin.dev.reload"
export const PLUGIN_DEV_INVOKE_TOOL_CAPABILITY = "plugin.dev.invokeTool"
export const PLUGIN_DEV_LIST_SURFACES_CAPABILITY = "plugin.dev.listSurfaces"
export const SESSION_CREATE_CAPABILITY = "session:create"
export const SESSION_SEND_CAPABILITY = "session:send"

export type HanaCapabilityStability = "stable" | "experimental" | "unknown"

export type HanaEventBusCapability = {
  readonly type: string
  readonly available?: boolean
  readonly stability?: string
}

export type HanaEventBusCapabilityEntry = string | HanaEventBusCapability
type MaybePromise<T> = T | Promise<T>

export interface HanaEventBus {
  listCapabilities(): MaybePromise<readonly HanaEventBusCapabilityEntry[]>
  getCapability?(
    capability: string
  ): MaybePromise<HanaEventBusCapabilityEntry | null>
  request(capability: string, payload?: unknown): Promise<unknown>
}

export type HanaAdapterOptions = {
  readonly eventBus: HanaEventBus
}

export type HanaCapabilityDiscovery = {
  readonly capabilities: readonly HanaEventBusCapabilityEntry[]
}

export type PluginDiagnosticsResult =
  | {
      readonly status: "available"
      readonly capability: typeof PLUGIN_DIAGNOSTICS_CAPABILITY
      readonly stability?: HanaCapabilityStability
      readonly diagnostics: unknown
    }
  | {
      readonly status: "unavailable" | "degraded"
      readonly reason: string
      readonly capability: typeof PLUGIN_DIAGNOSTICS_CAPABILITY
      readonly stability?: HanaCapabilityStability
    }

export type HanaActionResult =
  | {
      readonly status: "completed"
      readonly capability: string
      readonly stability?: HanaCapabilityStability
      readonly result: unknown
    }
  | {
      readonly status: "unavailable" | "degraded"
      readonly reason: string
      readonly capability: string
      readonly stability?: HanaCapabilityStability
    }

export type DevPluginInstallInput = {
  readonly sourcePath: string
  readonly pluginId?: string
  readonly allowFullAccess?: boolean
}

export type DevPluginReloadInput = {
  readonly pluginId: string
  readonly devRunId?: string
  readonly allowFullAccess?: boolean
}

export type DevPluginInvokeToolInput = {
  readonly pluginId: string
  readonly toolName: string
  readonly input?: Record<string, unknown>
  readonly sessionPath?: string
  readonly agentId?: string
}

export type PluginSurface = {
  readonly kind: string
  readonly pluginId: string
  readonly title?: string
  readonly route: string
  readonly routeUrl?: string
  readonly hostCapabilities: readonly string[]
}

export type ListPluginSurfacesInput = {
  readonly pluginId?: string
}

export type PluginSurfacesResult =
  | {
      readonly status: "completed"
      readonly capability: typeof PLUGIN_DEV_LIST_SURFACES_CAPABILITY
      readonly stability?: HanaCapabilityStability
      readonly surfaces: readonly PluginSurface[]
    }
  | {
      readonly status: "unavailable" | "degraded"
      readonly reason: string
      readonly capability: typeof PLUGIN_DEV_LIST_SURFACES_CAPABILITY
      readonly stability?: HanaCapabilityStability
    }

export type PluginPrivateSessionCreateInput = {
  readonly ownerPluginId: string
  readonly visibility?: "plugin_private"
  readonly title?: string
  readonly agentId?: string
  readonly cwd?: string
  readonly memoryEnabled?: boolean
  readonly workspaceFolders?: readonly string[]
  readonly thinkingLevel?: string
  readonly permissionMode?: string
  readonly kind?: string
}

export type PluginPrivateSessionMessageInput = {
  readonly sessionPath: string
  readonly text: string
  readonly context?: {
    readonly system?: string
    readonly beforeUser?: string
    readonly afterUser?: string
  }
}

export class HanaAdapter {
  readonly #eventBus: HanaEventBus

  constructor(options: HanaAdapterOptions) {
    this.#eventBus = options.eventBus
  }

  async discoverCapabilities(): Promise<HanaCapabilityDiscovery> {
    return {
      capabilities: await this.#eventBus.listCapabilities()
    }
  }

  async readPluginDiagnostics(pluginId: string): Promise<PluginDiagnosticsResult> {
    try {
      const capability = await this.#findCapability(PLUGIN_DIAGNOSTICS_CAPABILITY)
      if (!capability) {
        return {
          status: "unavailable",
          reason: `Missing Hana capability: ${PLUGIN_DIAGNOSTICS_CAPABILITY}`,
          capability: PLUGIN_DIAGNOSTICS_CAPABILITY
        }
      }
      if (capability.available === false) {
        return withCapabilityStability(
          {
            status: "unavailable",
            reason: `Hana capability unavailable: ${PLUGIN_DIAGNOSTICS_CAPABILITY}`,
            capability: PLUGIN_DIAGNOSTICS_CAPABILITY
          },
          capability.stability
        )
      }

      return withCapabilityStability(
        {
          status: "available",
          capability: PLUGIN_DIAGNOSTICS_CAPABILITY,
          diagnostics: await this.#eventBus.request(PLUGIN_DIAGNOSTICS_CAPABILITY, {
            pluginId
          })
        },
        capability.stability
      )
    } catch (error) {
      return {
        status: "degraded",
        reason: error instanceof Error ? error.message : String(error),
        capability: PLUGIN_DIAGNOSTICS_CAPABILITY
      }
    }
  }

  async installDevPlugin(input: DevPluginInstallInput): Promise<HanaActionResult> {
    return this.#requestCapability(
      PLUGIN_DEV_INSTALL_CAPABILITY,
      cleanUndefined({
        sourcePath: input.sourcePath,
        pluginId: input.pluginId,
        allowFullAccess: input.allowFullAccess
      })
    )
  }

  async reloadDevPlugin(input: DevPluginReloadInput): Promise<HanaActionResult> {
    return this.#requestCapability(
      PLUGIN_DEV_RELOAD_CAPABILITY,
      cleanUndefined({
        pluginId: input.pluginId,
        devRunId: input.devRunId,
        allowFullAccess: input.allowFullAccess
      })
    )
  }

  async invokePluginTool(input: DevPluginInvokeToolInput): Promise<HanaActionResult> {
    return this.#requestCapability(
      PLUGIN_DEV_INVOKE_TOOL_CAPABILITY,
      cleanUndefined({
        pluginId: input.pluginId,
        toolName: input.toolName,
        input: input.input,
        sessionPath: input.sessionPath,
        agentId: input.agentId
      })
    )
  }

  async listPluginSurfaces(
    input: ListPluginSurfacesInput = {}
  ): Promise<PluginSurfacesResult> {
    const result = await this.#requestCapability(
      PLUGIN_DEV_LIST_SURFACES_CAPABILITY,
      cleanUndefined({
        pluginId: input.pluginId
      })
    )

    if (result.status !== "completed") {
      return result as PluginSurfacesResult
    }

    return withSurfaceCapabilityStability(
      {
        status: "completed",
        capability: PLUGIN_DEV_LIST_SURFACES_CAPABILITY,
        surfaces: normalizeSurfaces(result.result)
      },
      result.stability
    )
  }

  async createPluginPrivateSession(
    input: PluginPrivateSessionCreateInput
  ): Promise<HanaActionResult> {
    return this.#requestCapability(
      SESSION_CREATE_CAPABILITY,
      cleanUndefined({
        ownerPluginId: input.ownerPluginId,
        kind: input.kind ?? "myhanako.lab",
        visibility: "plugin_private",
        title: input.title,
        agentId: input.agentId,
        cwd: input.cwd,
        memoryEnabled: input.memoryEnabled,
        workspaceFolders: input.workspaceFolders,
        thinkingLevel: input.thinkingLevel,
        permissionMode: input.permissionMode
      })
    )
  }

  async sendPluginPrivateSessionMessage(
    input: PluginPrivateSessionMessageInput
  ): Promise<HanaActionResult> {
    return this.#requestCapability(
      SESSION_SEND_CAPABILITY,
      cleanUndefined({
        sessionPath: input.sessionPath,
        text: input.text,
        context: input.context
      })
    )
  }

  async #requestCapability(
    capabilityType: string,
    payload: Record<string, unknown>
  ): Promise<HanaActionResult> {
    try {
      const capability = await this.#findCapability(capabilityType)
      if (!capability) {
        return {
          status: "unavailable",
          reason: `Missing Hana capability: ${capabilityType}`,
          capability: capabilityType
        }
      }
      if (capability.available === false) {
        return withActionStability(
          {
            status: "unavailable",
            reason: `Hana capability unavailable: ${capabilityType}`,
            capability: capabilityType
          },
          capability.stability
        )
      }

      return withActionStability(
        {
          status: "completed",
          capability: capabilityType,
          result: await this.#eventBus.request(capabilityType, payload)
        },
        capability.stability
      )
    } catch (error) {
      return {
        status: "degraded",
        reason: error instanceof Error ? error.message : String(error),
        capability: capabilityType
      }
    }
  }

  async #findCapability(
    capabilityType: string
  ): Promise<NormalizedHanaCapability | null> {
    if (this.#eventBus.getCapability) {
      const capability = normalizeCapability(
        await this.#eventBus.getCapability(capabilityType)
      )
      if (capability) {
        return capability
      }
    }

    const { capabilities } = await this.discoverCapabilities()
    for (const capability of capabilities) {
      const normalized = normalizeCapability(capability)
      if (normalized?.type === capabilityType) {
        return normalized
      }
    }
    return null
  }
}

type NormalizedHanaCapability = {
  readonly type: string
  readonly available?: boolean
  readonly stability?: HanaCapabilityStability
}

function normalizeCapability(
  capability: HanaEventBusCapabilityEntry | null | undefined
): NormalizedHanaCapability | null {
  if (typeof capability === "string") {
    return {
      type: capability
    }
  }
  if (!capability || typeof capability.type !== "string") {
    return null
  }

  const normalized: NormalizedHanaCapability = {
    type: capability.type
  }
  if (typeof capability.available === "boolean") {
    return {
      ...normalized,
      available: capability.available,
      stability: normalizeStability(capability.stability)
    }
  }
  return {
    ...normalized,
    stability: normalizeStability(capability.stability)
  }
}

function normalizeStability(
  stability: string | undefined
): HanaCapabilityStability | undefined {
  return stability === "stable" ||
    stability === "experimental" ||
    stability === "unknown"
    ? stability
    : undefined
}

function withCapabilityStability<T extends PluginDiagnosticsResult>(
  result: T,
  stability: HanaCapabilityStability | undefined
): T {
  return stability === undefined
    ? result
    : {
        ...result,
        stability
      }
}

function withActionStability<T extends HanaActionResult>(
  result: T,
  stability: HanaCapabilityStability | undefined
): T {
  return stability === undefined
    ? result
    : {
        ...result,
        stability
      }
}

function withSurfaceCapabilityStability<T extends PluginSurfacesResult>(
  result: T,
  stability: HanaCapabilityStability | undefined
): T {
  return stability === undefined
    ? result
    : {
        ...result,
        stability
      }
}

function cleanUndefined<T extends Record<string, unknown>>(input: T): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined)
  )
}

function normalizeSurfaces(value: unknown): readonly PluginSurface[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value.flatMap((item) => {
    if (item === null || typeof item !== "object" || Array.isArray(item)) {
      return []
    }
    const record = item as Record<string, unknown>
    if (
      typeof record.kind !== "string" ||
      typeof record.pluginId !== "string" ||
      typeof record.route !== "string"
    ) {
      return []
    }
    return [
      {
        kind: record.kind,
        pluginId: record.pluginId,
        title: typeof record.title === "string" ? record.title : undefined,
        route: record.route,
        routeUrl: typeof record.routeUrl === "string" ? record.routeUrl : undefined,
        hostCapabilities: Array.isArray(record.hostCapabilities)
          ? record.hostCapabilities.filter((item): item is string => typeof item === "string")
          : []
      }
    ]
  })
}
