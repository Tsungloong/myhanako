import {
  CommandRegistry,
  type CommandRegistration
} from "./command-registry.ts"
import {
  ToolRegistry,
  type ToolRegistration
} from "./tool-registry.ts"

export type PluginAccess = "restricted" | "full-access"
export type PluginStatus = "enabled" | "disabled"

export type PluginManifest = {
  readonly id: string
  readonly name: string
  readonly version: string
  readonly access: PluginAccess
  readonly permissions: readonly string[]
  readonly routes?: readonly string[]
  readonly providers?: readonly string[]
  readonly extensions?: readonly string[]
  readonly runtime?: string
}

export type PluginSnapshot = {
  readonly id: string
  readonly name: string
  readonly version: string
  readonly access: PluginAccess
  readonly status: PluginStatus
  readonly permissions: readonly string[]
  readonly routes?: readonly string[]
  readonly providers?: readonly string[]
  readonly extensions?: readonly string[]
}

export type PluginToolContribution = Omit<ToolRegistration, "source">

export type PluginCommandContribution = Omit<
  CommandRegistration,
  "source" | "sourceId"
>

export type PluginLoadInput = {
  readonly manifest: PluginManifest
  readonly tools?: readonly PluginToolContribution[]
  readonly commands?: readonly PluginCommandContribution[]
}

export type PluginManagerOptions = {
  readonly toolRegistry: ToolRegistry
  readonly commandRegistry: CommandRegistry
}

type LoadedPlugin = {
  readonly manifest: PluginManifest
  status: PluginStatus
}

const FULL_ACCESS_ONLY_FIELDS = ["routes", "providers", "extensions", "runtime"] as const

export class PluginManager {
  readonly #toolRegistry: ToolRegistry
  readonly #commandRegistry: CommandRegistry
  readonly #plugins = new Map<string, LoadedPlugin>()

  constructor(options: PluginManagerOptions) {
    this.#toolRegistry = options.toolRegistry
    this.#commandRegistry = options.commandRegistry
  }

  loadPlugin(input: PluginLoadInput): PluginSnapshot {
    validateManifest(input.manifest)
    if (this.#plugins.has(input.manifest.id)) {
      throw new Error(`Plugin already loaded: ${input.manifest.id}`)
    }

    validateAccess(input.manifest)
    validateContributionPermissions(input)

    const loaded: LoadedPlugin = {
      manifest: input.manifest,
      status: "enabled"
    }

    try {
      this.#plugins.set(input.manifest.id, loaded)

      for (const tool of input.tools ?? []) {
        this.#toolRegistry.register({
          ...tool,
          source: input.manifest.id
        })
      }

      for (const command of input.commands ?? []) {
        const handle = this.#commandRegistry.register(
          {
            ...command,
            source: "plugin",
            sourceId: input.manifest.id
          },
          {
            source: "plugin",
            sourceId: input.manifest.id
          }
        )
        if (!handle) {
          throw new Error(`Plugin command rejected: ${input.manifest.id} ${command.name}`)
        }
      }

      return toPluginSnapshot(loaded)
    } catch (error) {
      this.#toolRegistry.unregisterBySource(input.manifest.id)
      this.#commandRegistry.unregisterBySource("plugin", input.manifest.id)
      this.#plugins.delete(input.manifest.id)
      throw error
    }
  }

  listPlugins(): readonly PluginSnapshot[] {
    return Array.from(this.#plugins.values())
      .map(toPluginSnapshot)
      .sort((left, right) => left.id.localeCompare(right.id))
  }

  disablePlugin(pluginId: string): boolean {
    const plugin = this.#plugins.get(pluginId)
    if (!plugin || plugin.status === "disabled") {
      return false
    }

    this.#toolRegistry.unregisterBySource(pluginId)
    this.#commandRegistry.unregisterBySource("plugin", pluginId)
    plugin.status = "disabled"
    return true
  }
}

function validateManifest(manifest: PluginManifest): void {
  if (!manifest.id.trim()) {
    throw new Error("Plugin id required")
  }
  if (!manifest.name.trim()) {
    throw new Error(`Plugin name required: ${manifest.id}`)
  }
  if (!manifest.version.trim()) {
    throw new Error(`Plugin version required: ${manifest.id}`)
  }
}

function validateAccess(manifest: PluginManifest): void {
  if (manifest.access !== "restricted") {
    return
  }

  const hasFullAccessDeclaration = FULL_ACCESS_ONLY_FIELDS.some((field) =>
    hasDeclaration(manifest[field])
  )
  if (hasFullAccessDeclaration) {
    throw new Error(
      `Restricted plugin cannot declare full-access capabilities: ${manifest.id}`
    )
  }
}

function validateContributionPermissions(input: PluginLoadInput): void {
  const permissions = new Set(input.manifest.permissions)

  if ((input.tools?.length ?? 0) > 0 && !permissions.has("tool:register")) {
    throw new Error(`Plugin missing permission tool:register: ${input.manifest.id}`)
  }

  if ((input.commands?.length ?? 0) > 0 && !permissions.has("command:register")) {
    throw new Error(`Plugin missing permission command:register: ${input.manifest.id}`)
  }

  for (const tool of input.tools ?? []) {
    for (const permission of tool.permissions) {
      if (!permissions.has(permission)) {
        throw new Error(
          `Plugin tool permission not declared: ${input.manifest.id} ${permission}`
        )
      }
    }
  }
}

function hasDeclaration(value: readonly string[] | string | undefined): boolean {
  if (Array.isArray(value)) {
    return value.length > 0
  }
  return typeof value === "string" && value.trim().length > 0
}

function toPluginSnapshot(plugin: LoadedPlugin): PluginSnapshot {
  const snapshot: PluginSnapshot = {
    id: plugin.manifest.id,
    name: plugin.manifest.name,
    version: plugin.manifest.version,
    access: plugin.manifest.access,
    status: plugin.status,
    permissions: [...plugin.manifest.permissions],
    routes: cloneOptionalArray(plugin.manifest.routes),
    providers: cloneOptionalArray(plugin.manifest.providers),
    extensions: cloneOptionalArray(plugin.manifest.extensions)
  }

  return withoutUndefinedArrays(snapshot)
}

function cloneOptionalArray(values: readonly string[] | undefined): readonly string[] | undefined {
  return values ? [...values] : undefined
}

function withoutUndefinedArrays(snapshot: PluginSnapshot): PluginSnapshot {
  return Object.fromEntries(
    Object.entries(snapshot).filter(([, value]) => value !== undefined)
  ) as PluginSnapshot
}
