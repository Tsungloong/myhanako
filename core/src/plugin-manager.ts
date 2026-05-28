import { readdir, readFile, stat } from "node:fs/promises"
import { join, resolve } from "node:path"
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

export type LocalPluginManifest = {
  readonly rootDir: string
  readonly manifestPath: string
  readonly manifest: PluginManifest
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
const LOCAL_PLUGIN_MANIFEST_PATHS = ["plugin.json", ".codex-plugin/plugin.json"] as const

export class PluginManager {
  readonly #toolRegistry: ToolRegistry
  readonly #commandRegistry: CommandRegistry
  readonly #plugins = new Map<string, LoadedPlugin>()

  constructor(options: PluginManagerOptions) {
    this.#toolRegistry = options.toolRegistry
    this.#commandRegistry = options.commandRegistry
  }

  async discoverLocalPlugins(rootDirs: readonly string[]): Promise<readonly LocalPluginManifest[]> {
    return discoverLocalPluginManifests(rootDirs)
  }

  async loadLocalPlugins(rootDirs: readonly string[]): Promise<readonly PluginSnapshot[]> {
    const discoveredPlugins = await this.discoverLocalPlugins(rootDirs)
    const seenPluginIds = new Set<string>()

    for (const plugin of discoveredPlugins) {
      if (seenPluginIds.has(plugin.manifest.id) || this.#plugins.has(plugin.manifest.id)) {
        throw new Error(`Plugin already loaded: ${plugin.manifest.id}`)
      }
      seenPluginIds.add(plugin.manifest.id)
    }

    return discoveredPlugins.map((plugin) => this.loadPlugin({ manifest: plugin.manifest }))
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

export async function discoverLocalPluginManifests(
  rootDirs: readonly string[]
): Promise<readonly LocalPluginManifest[]> {
  const candidates = new Map<string, { rootDir: string; manifestPath: string }>()

  for (const rootDir of rootDirs) {
    const resolvedRootDir = resolve(rootDir)
    const rootManifestPath = await findLocalPluginManifestPath(resolvedRootDir)

    if (rootManifestPath) {
      candidates.set(rootManifestPath, {
        rootDir: resolvedRootDir,
        manifestPath: rootManifestPath
      })
      continue
    }

    for (const child of await readDirectoryEntries(resolvedRootDir)) {
      if (!child.isDirectory()) {
        continue
      }

      const childRootDir = join(resolvedRootDir, child.name)
      const childManifestPath = await findLocalPluginManifestPath(childRootDir)
      if (childManifestPath) {
        candidates.set(childManifestPath, {
          rootDir: childRootDir,
          manifestPath: childManifestPath
        })
      }
    }
  }

  const manifests: LocalPluginManifest[] = []
  for (const candidate of Array.from(candidates.values()).sort((left, right) =>
    left.manifestPath.localeCompare(right.manifestPath)
  )) {
    manifests.push({
      ...candidate,
      manifest: await readLocalPluginManifest(candidate.manifestPath)
    })
  }

  return manifests.sort((left, right) => left.manifest.id.localeCompare(right.manifest.id))
}

async function findLocalPluginManifestPath(pluginRootDir: string): Promise<string | null> {
  for (const manifestPath of LOCAL_PLUGIN_MANIFEST_PATHS) {
    const candidatePath = join(pluginRootDir, manifestPath)
    if (await isReadableFile(candidatePath)) {
      return candidatePath
    }
  }

  return null
}

async function readLocalPluginManifest(manifestPath: string): Promise<PluginManifest> {
  let rawManifest: string
  try {
    rawManifest = await readFile(manifestPath, "utf8")
  } catch (error) {
    throw new Error(`Plugin manifest not readable: ${manifestPath}`, { cause: error })
  }

  let parsedManifest: unknown
  try {
    parsedManifest = JSON.parse(rawManifest)
  } catch (error) {
    throw new Error(`Plugin manifest JSON invalid: ${manifestPath}`, { cause: error })
  }

  const manifest = parsePluginManifest(parsedManifest, manifestPath)
  validateManifest(manifest)
  validateAccess(manifest)
  return manifest
}

function parsePluginManifest(value: unknown, manifestPath: string): PluginManifest {
  if (!isRecord(value)) {
    throw new Error(`Plugin manifest must be an object: ${manifestPath}`)
  }

  const manifest: PluginManifest = {
    id: readStringField(value, "id", manifestPath),
    name: readStringField(value, "name", manifestPath),
    version: readStringField(value, "version", manifestPath),
    access: readAccessField(value, manifestPath),
    permissions: readStringArrayField(value, "permissions", manifestPath),
    routes: readOptionalStringArrayField(value, "routes", manifestPath),
    providers: readOptionalStringArrayField(value, "providers", manifestPath),
    extensions: readOptionalStringArrayField(value, "extensions", manifestPath),
    runtime: readOptionalStringField(value, "runtime", manifestPath)
  }

  return withoutUndefinedManifestFields(manifest)
}

async function readDirectoryEntries(directoryPath: string) {
  try {
    return await readdir(directoryPath, { withFileTypes: true })
  } catch (error) {
    if (hasErrorCode(error, "ENOENT") || hasErrorCode(error, "ENOTDIR")) {
      return []
    }
    throw error
  }
}

async function isReadableFile(filePath: string): Promise<boolean> {
  try {
    const file = await stat(filePath)
    return file.isFile()
  } catch (error) {
    if (hasErrorCode(error, "ENOENT") || hasErrorCode(error, "ENOTDIR")) {
      return false
    }
    throw error
  }
}

function readStringField(
  value: Record<string, unknown>,
  field: string,
  manifestPath: string
): string {
  const fieldValue = value[field]
  if (typeof fieldValue !== "string") {
    throw new Error(`Plugin manifest field ${field} must be a string: ${manifestPath}`)
  }
  return fieldValue
}

function readOptionalStringField(
  value: Record<string, unknown>,
  field: string,
  manifestPath: string
): string | undefined {
  const fieldValue = value[field]
  if (fieldValue === undefined) {
    return undefined
  }
  if (typeof fieldValue !== "string") {
    throw new Error(`Plugin manifest field ${field} must be a string: ${manifestPath}`)
  }
  return fieldValue
}

function readAccessField(value: Record<string, unknown>, manifestPath: string): PluginAccess {
  const access = value.access
  if (access !== "restricted" && access !== "full-access") {
    throw new Error(`Plugin manifest access invalid: ${manifestPath}`)
  }
  return access
}

function readStringArrayField(
  value: Record<string, unknown>,
  field: string,
  manifestPath: string
): readonly string[] {
  const fieldValue = value[field]
  if (!Array.isArray(fieldValue) || !fieldValue.every((item) => typeof item === "string")) {
    throw new Error(`Plugin manifest field ${field} must be a string array: ${manifestPath}`)
  }
  return fieldValue
}

function readOptionalStringArrayField(
  value: Record<string, unknown>,
  field: string,
  manifestPath: string
): readonly string[] | undefined {
  const fieldValue = value[field]
  if (fieldValue === undefined) {
    return undefined
  }
  if (!Array.isArray(fieldValue) || !fieldValue.every((item) => typeof item === "string")) {
    throw new Error(`Plugin manifest field ${field} must be a string array: ${manifestPath}`)
  }
  return fieldValue
}

function withoutUndefinedManifestFields(manifest: PluginManifest): PluginManifest {
  return Object.fromEntries(
    Object.entries(manifest).filter(([, value]) => value !== undefined)
  ) as PluginManifest
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function hasErrorCode(error: unknown, code: string): boolean {
  return isRecord(error) && error.code === code
}
