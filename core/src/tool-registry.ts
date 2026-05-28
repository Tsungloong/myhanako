import type { JsonObject, JsonValue, ToolDefinitionSnapshot } from "../../shared/src/session-events.ts"
import type { ExecutionBoundary } from "./execution-boundary.ts"
import type { ResourceAccessSubject } from "./resource-access-service.ts"

export type ToolExecutionInput = {
  readonly sessionId: string
  readonly toolCallId: string
  readonly arguments: JsonObject
}

export type ToolExecutionOptions = {
  readonly subject?: ResourceAccessSubject
}

export type ToolExecutor = (input: ToolExecutionInput) => Promise<JsonValue>

export type ToolRegistration = ToolDefinitionSnapshot & {
  readonly execute: ToolExecutor
}

export type ToolDescriptionOverride = {
  readonly description?: string
  readonly parameterDescriptions?: JsonObject
  readonly examples?: readonly string[]
  readonly modelHints?: readonly string[]
  readonly schemaChecksum?: string
  readonly permissions?: readonly string[]
}

export type ListToolDefinitionsOptions = {
  readonly descriptionOverrides?: Record<string, ToolDescriptionOverride>
}

export type ToolRegistryOptions = {
  readonly executionBoundary?: ExecutionBoundary
}

export class ToolRegistry {
  readonly #tools = new Map<string, ToolRegistration>()
  readonly #executionBoundary?: ExecutionBoundary

  constructor(options: ToolRegistryOptions = {}) {
    this.#executionBoundary = options.executionBoundary
  }

  register(tool: ToolRegistration): void {
    if (this.#tools.has(tool.id)) {
      throw new Error(`Tool already registered: ${tool.id}`)
    }

    this.#tools.set(tool.id, {
      ...tool,
      permissions: [...tool.permissions]
    })
  }

  listDefinitions(options: ListToolDefinitionsOptions = {}): readonly ToolDefinitionSnapshot[] {
    return Array.from(this.#tools.values())
      .map((tool) => toToolDefinition(tool, options.descriptionOverrides?.[tool.id]))
      .sort((left, right) => left.id.localeCompare(right.id))
  }

  async execute(
    toolId: string,
    input: ToolExecutionInput,
    options: ToolExecutionOptions = {}
  ): Promise<JsonValue> {
    const tool = this.#tools.get(toolId)
    if (!tool) {
      throw new Error(`Tool not registered: ${toolId}`)
    }

    this.#executionBoundary?.assertToolExecutionAllowed({
      sessionId: input.sessionId,
      toolCallId: input.toolCallId,
      tool: toToolDefinition(tool),
      subject: options.subject
    })

    return tool.execute(input)
  }

  unregisterBySource(source: string): number {
    let count = 0
    for (const [toolId, tool] of Array.from(this.#tools.entries())) {
      if (tool.source === source) {
        this.#tools.delete(toolId)
        count += 1
      }
    }
    return count
  }
}

function toToolDefinition(
  tool: ToolRegistration,
  override?: ToolDescriptionOverride
): ToolDefinitionSnapshot {
  return {
    id: tool.id,
    name: tool.name,
    source: tool.source,
    description: override?.description ?? tool.description,
    schemaChecksum: tool.schemaChecksum,
    permissions: [...tool.permissions]
  }
}
