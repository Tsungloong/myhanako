import type {
  JsonValue,
  PromptLayerSnapshot,
  ToolDefinitionSnapshot
} from "./session-events.ts"

export type ModelRole = "chat" | "smallTool" | "largeTool" | "vision"

export type PromptMessage = {
  readonly role: "system" | "user" | "assistant" | "tool"
  readonly content: JsonValue
  readonly layerId?: string
}

export type PromptBundle = {
  readonly requestId: string
  readonly model: string
  readonly modelRole: ModelRole
  readonly messages: readonly PromptMessage[]
  readonly toolDefinitions: readonly ToolDefinitionSnapshot[]
  readonly layers: readonly PromptLayerSnapshot[]
  readonly injectedMemoryIds: readonly string[]
  readonly enabledSkillIds: readonly string[]
  readonly enabledToolIds: readonly string[]
  readonly tokenEstimate: number
  readonly warnings: readonly string[]
}
