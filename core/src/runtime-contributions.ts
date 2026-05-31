import type {
  JsonArray,
  JsonObject,
  JsonPrimitive,
  JsonValue,
  ToolDefinitionSnapshot
} from "../../shared/src/session-events.ts"
import {
  PI_BUILTIN_TOOL_NAMES,
  type ToolDefinition
} from "../../lib/pi-sdk/session-options.ts"
import type { CommandDefinitionSnapshot } from "./command-registry.ts"
import type {
  RuntimeResourceContributions,
  RuntimeResourceDiagnostic,
  RuntimeResourceSkill,
  RuntimeResourceSkillResult
} from "./runtime-resource-loader.ts"
import type {
  ToolExecutionInput,
  ToolExecutionOptions
} from "./tool-registry.ts"

export type RuntimeToolResult = {
  readonly content: readonly {
    readonly type: "text"
    readonly text: string
  }[]
  readonly details?: JsonValue
}

export type RuntimeToolDefinition = ToolDefinition & {
  readonly name: string
  readonly label: string
  readonly description: string
  readonly parameters: unknown
  readonly execute: (
    toolCallId: string,
    params: unknown,
    signal: AbortSignal | undefined,
    onUpdate: unknown,
    ctx: unknown
  ) => Promise<RuntimeToolResult>
}

export type RuntimeToolRegistryLike = {
  readonly listDefinitions: () => readonly ToolDefinitionSnapshot[]
  readonly execute: (
    toolId: string,
    input: ToolExecutionInput,
    options?: ToolExecutionOptions
  ) => Promise<JsonValue>
}

export type RuntimeCommandRegistryLike = {
  readonly listDefinitions: () => readonly CommandDefinitionSnapshot[]
}

export type RuntimePluginSkillPath = string | {
  readonly dirPath?: string
  readonly path?: string
}

export type RuntimePluginManagerLike = {
  readonly getExtensionFactories?: () => readonly unknown[]
  readonly getExtensionPaths?: () => readonly string[]
  readonly getSkillPaths?: () => readonly RuntimePluginSkillPath[]
  readonly listPlugins?: () => readonly unknown[]
}

export type RuntimeSkillManagerLike = {
  readonly getSkillsForAgent?: (agent?: unknown) => RuntimeResourceSkillResult
  readonly resolveRuntimeSkills?: (input?: unknown) => RuntimeResourceSkillResult
}

export type ResolveRuntimeResourceContributionsOptions = {
  readonly builtinToolNames?: readonly string[]
  readonly toolRegistry?: RuntimeToolRegistryLike
  readonly commandRegistry?: RuntimeCommandRegistryLike
  readonly pluginManager?: RuntimePluginManagerLike
  readonly skillManager?: RuntimeSkillManagerLike
  readonly skillContext?: unknown
  readonly toolExecutionOptions?: ToolExecutionOptions
}

export type ResolvedRuntimeResourceContributions = RuntimeResourceContributions & {
  readonly tools: readonly string[]
  readonly customTools: readonly RuntimeToolDefinition[]
  readonly toolDefinitions: readonly ToolDefinitionSnapshot[]
  readonly commandDefinitions: readonly CommandDefinitionSnapshot[]
  readonly pluginSnapshots: readonly unknown[]
  readonly diagnostics: readonly RuntimeResourceDiagnostic[]
}

const ANY_JSON_OBJECT_PARAMETERS = Object.freeze({
  type: "object",
  properties: {},
  additionalProperties: true
})

export function resolveRuntimeResourceContributions(
  options: ResolveRuntimeResourceContributionsOptions = {}
): ResolvedRuntimeResourceContributions {
  const builtinToolNames = options.builtinToolNames ?? PI_BUILTIN_TOOL_NAMES
  const toolDefinitions = [...(options.toolRegistry?.listDefinitions() ?? [])]
  const customTools = options.toolRegistry
    ? toolDefinitions.map((definition) =>
      toRuntimeToolDefinition(definition, options.toolRegistry, options.toolExecutionOptions)
    )
    : []
  const skillResult = resolveSkills(options.skillManager, options.skillContext)

  return {
    tools: uniqueStrings([
      ...builtinToolNames,
      ...customTools.map((tool) => tool.name)
    ]),
    customTools,
    skills: skillResult.skills,
    diagnostics: skillResult.diagnostics,
    extensionFactories: [...(options.pluginManager?.getExtensionFactories?.() ?? [])],
    skillPaths: resolveSkillPaths(options.pluginManager),
    extensionPaths: resolveExtensionPaths(options.pluginManager),
    toolDefinitions,
    commandDefinitions: [...(options.commandRegistry?.listDefinitions() ?? [])],
    pluginSnapshots: [...(options.pluginManager?.listPlugins?.() ?? [])]
  }
}

function toRuntimeToolDefinition(
  definition: ToolDefinitionSnapshot,
  toolRegistry: RuntimeToolRegistryLike,
  toolExecutionOptions: ToolExecutionOptions | undefined
): RuntimeToolDefinition {
  return {
    name: definition.name,
    label: definition.name,
    description: definition.description,
    parameters: definition.parameters ?? ANY_JSON_OBJECT_PARAMETERS,
    async execute(toolCallId, params, _signal, _onUpdate, ctx) {
      const result = await toolRegistry.execute(
        definition.id,
        {
          sessionId: getSessionId(ctx),
          toolCallId,
          arguments: toJsonObject(params)
        },
        resolveToolExecutionOptions(toolExecutionOptions, ctx)
      )
      return normalizeToolResult(result)
    }
  }
}

function resolveToolExecutionOptions(
  baseOptions: ToolExecutionOptions | undefined,
  ctx: unknown
): ToolExecutionOptions | undefined {
  const subject = getExecutionSubject(ctx)
  if (!subject) {
    return baseOptions
  }
  return {
    ...baseOptions,
    subject
  }
}

function getExecutionSubject(ctx: unknown): ToolExecutionOptions["subject"] | undefined {
  if (!isRecord(ctx)) {
    return undefined
  }
  const candidate = ctx.executionSubject ?? ctx.subject
  return isResourceAccessSubject(candidate) ? candidate : undefined
}

function isResourceAccessSubject(value: unknown): value is NonNullable<ToolExecutionOptions["subject"]> {
  if (!isRecord(value)) {
    return false
  }
  const permissions = value.permissions
  const access = value.access
  return (
    (value.type === "plugin" || value.type === "tool" || value.type === "system") &&
    typeof value.id === "string" &&
    value.id.trim().length > 0 &&
    Array.isArray(permissions) &&
    permissions.every((permission) => typeof permission === "string") &&
    (access === undefined || access === "restricted" || access === "full-access")
  )
}

function resolveSkills(
  skillManager: RuntimeSkillManagerLike | undefined,
  skillContext: unknown
): RuntimeResourceSkillResult {
  const result = skillManager?.getSkillsForAgent?.(skillContext)
    ?? skillManager?.resolveRuntimeSkills?.(skillContext)
    ?? {
      skills: [],
      diagnostics: []
    }

  return {
    skills: [...result.skills],
    diagnostics: [...result.diagnostics]
  }
}

function resolveSkillPaths(
  pluginManager: RuntimePluginManagerLike | undefined
): readonly string[] {
  const paths = pluginManager?.getSkillPaths?.() ?? []
  return uniqueStrings(paths.flatMap((entry) => {
    if (typeof entry === "string") {
      return entry.trim() ? [entry] : []
    }
    const rawPath = entry.dirPath ?? entry.path
    return rawPath?.trim() ? [rawPath] : []
  }))
}

function resolveExtensionPaths(
  pluginManager: RuntimePluginManagerLike | undefined
): readonly string[] {
  const explicitPaths = pluginManager?.getExtensionPaths?.() ?? []
  const pluginSnapshots = pluginManager?.listPlugins?.() ?? []
  const snapshotPaths = pluginSnapshots.flatMap((plugin) => {
    if (!isRecord(plugin) || plugin.status !== "enabled" || plugin.access !== "full-access") {
      return []
    }
    return readStringArray(plugin.extensions)
  })

  return uniqueStrings([...explicitPaths, ...snapshotPaths])
}

function normalizeToolResult(result: JsonValue): RuntimeToolResult {
  return {
    content: [
      {
        type: "text",
        text: typeof result === "string" ? result : JSON.stringify(result)
      }
    ],
    details: result
  }
}

function getSessionId(ctx: unknown): string {
  if (isRecord(ctx)) {
    const sessionId = ctx.sessionId
    if (typeof sessionId === "string" && sessionId.trim()) {
      return sessionId
    }
    const sessionManager = ctx.sessionManager
    if (isRecord(sessionManager) && typeof sessionManager.getSessionFile === "function") {
      const sessionFile = sessionManager.getSessionFile()
      if (typeof sessionFile === "string" && sessionFile.trim()) {
        return sessionFile
      }
    }
  }
  return "unknown-session"
}

function toJsonObject(value: unknown): JsonObject {
  const jsonValue = toJsonValue(value)
  if (isJsonObject(jsonValue)) {
    return jsonValue
  }
  throw new TypeError("Tool arguments must be a JSON object")
}

function toJsonValue(value: unknown): JsonValue {
  if (value === null || isJsonPrimitive(value)) {
    return value
  }
  if (Array.isArray(value)) {
    return value.map(toJsonValue) as JsonArray
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, toJsonValue(entry)])
    )
  }
  throw new TypeError("Tool arguments must be JSON-compatible")
}

function isJsonPrimitive(value: unknown): value is Exclude<JsonPrimitive, null> {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean"
}

function isJsonObject(value: JsonValue): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function readStringArray(value: unknown): readonly string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : []
}

function uniqueStrings(values: readonly string[]): readonly string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))]
}
