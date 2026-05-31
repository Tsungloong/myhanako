export const PI_BUILTIN_TOOL_NAMES = Object.freeze([
  "read",
  "write",
  "edit",
  "bash",
  "grep",
  "find",
  "ls"
])

export type AgentTool = {
  readonly name: string
  readonly label?: string
  readonly description?: string
  readonly parameters?: unknown
  readonly prepareArguments?: unknown
  readonly executionMode?: unknown
  readonly renderCall?: unknown
  readonly renderResult?: unknown
  readonly renderShell?: unknown
  readonly promptSnippet?: unknown
  readonly promptGuidelines?: unknown
  readonly execute: (...args: unknown[]) => unknown
}

export type ToolDefinition = {
  readonly name: string
  readonly label?: string
  readonly description?: string
  readonly parameters?: unknown
  readonly prepareArguments?: unknown
  readonly executionMode?: unknown
  readonly renderCall?: unknown
  readonly renderResult?: unknown
  readonly renderShell?: unknown
  readonly promptSnippet?: unknown
  readonly promptGuidelines?: unknown
  readonly execute?: (...args: unknown[]) => unknown
}

export type CreateAgentSessionOptions = {
  readonly tools?: readonly AgentTool[]
  readonly customTools?: readonly ToolDefinition[]
  readonly [key: string]: unknown
}

export function assertAgentTool(tool: unknown, owner = "createAgentSession.tools"): asserts tool is AgentTool {
  if (!tool || typeof tool !== "object") {
    throw new TypeError(`${owner} must contain tool objects`)
  }

  const candidate = tool as Partial<AgentTool>
  if (typeof candidate.name !== "string" || candidate.name.length === 0) {
    throw new TypeError(`${owner} contains a tool without a non-empty string name`)
  }

  if (typeof candidate.execute !== "function") {
    throw new TypeError(`${owner}.${candidate.name} must have an execute function`)
  }
}

export function getToolDefinitionName(tool: unknown, owner = "createAgentSession.customTools"): string {
  if (!tool || typeof tool !== "object") {
    throw new TypeError(`${owner} must contain tool definition objects`)
  }

  const candidate = tool as Partial<ToolDefinition>
  if (typeof candidate.name !== "string" || candidate.name.length === 0) {
    throw new TypeError(`${owner} contains a tool without a non-empty string name`)
  }

  return candidate.name
}

export function agentToolToToolDefinition(tool: AgentTool): ToolDefinition {
  assertAgentTool(tool)
  return {
    name: tool.name,
    label: tool.label,
    description: tool.description,
    parameters: tool.parameters,
    prepareArguments: tool.prepareArguments,
    executionMode: tool.executionMode,
    renderCall: tool.renderCall,
    renderResult: tool.renderResult,
    renderShell: tool.renderShell,
    promptSnippet: tool.promptSnippet,
    promptGuidelines: tool.promptGuidelines,
    execute: (...args: unknown[]) => tool.execute(...args)
  }
}

export function normalizeCreateAgentSessionOptions<T extends CreateAgentSessionOptions>(
  options: T,
  version = "0.70.2"
): T & { readonly tools?: readonly string[]; readonly customTools?: readonly ToolDefinition[] } {
  if (!isPiSdkNameAllowlistVersion(version)) {
    return options
  }

  const rawTools = Array.isArray(options.tools) ? options.tools : []
  const rawCustomTools = Array.isArray(options.customTools) ? options.customTools : []

  for (const tool of rawTools) {
    assertAgentTool(tool)
  }

  const convertedBaseTools = rawTools.map(agentToolToToolDefinition)
  const allowedNames = uniqueToolNames([
    ...rawTools.map((tool) => tool.name),
    ...rawCustomTools.map((tool) => getToolDefinitionName(tool))
  ])

  return {
    ...options,
    tools: allowedNames,
    customTools: [
      ...convertedBaseTools,
      ...rawCustomTools
    ]
  }
}

export function isPiSdkNameAllowlistVersion(version: string): boolean {
  const [majorRaw, minorRaw] = String(version).split(".")
  const major = Number.parseInt(majorRaw ?? "", 10)
  const minor = Number.parseInt(minorRaw ?? "", 10)
  if (!Number.isFinite(major) || !Number.isFinite(minor)) {
    throw new Error(`Unsupported @mariozechner/pi-coding-agent version: ${version}`)
  }

  return major > 0 || (major === 0 && minor >= 68)
}

function uniqueToolNames(names: readonly string[]): readonly string[] {
  return [...new Set(names.filter((name) => name.length > 0))]
}
