import { createHash, randomUUID } from "node:crypto"
import type { PromptBundle, ModelRole, PromptMessage } from "../../shared/src/prompt-bundle.ts"
import type {
  PromptLayerSnapshot,
  SessionEvent,
  SessionEventActor,
  ToolDefinitionSnapshot
} from "../../shared/src/session-events.ts"
import type { SessionEventLog } from "./session-event-log.ts"

export type PromptLayerInput = Omit<PromptLayerSnapshot, "checksum"> & {
  readonly content: string
  readonly checksum?: string
}

export type AssemblePromptInput = {
  readonly requestId?: string
  readonly model: string
  readonly modelRole: ModelRole
  readonly layers: readonly PromptLayerInput[]
  readonly toolDefinitions?: readonly ToolDefinitionSnapshot[]
  readonly injectedMemoryIds?: readonly string[]
  readonly enabledSkillIds?: readonly string[]
  readonly enabledToolIds?: readonly string[]
}

export type PromptAssemblerOptions = {
  readonly requestIdFactory?: () => string
  readonly tokenEstimator?: (content: string) => number
  readonly checksumFactory?: (content: string) => string
}

export type RecordPromptBundleEventsInput = {
  readonly log: SessionEventLog
  readonly sessionId: string
  readonly bundle: PromptBundle
  readonly actor?: SessionEventActor
  readonly correlationId?: string
}

export type RecordedPromptBundleEvents = readonly [
  SessionEvent<"prompt_layers_resolved">,
  SessionEvent<"memory_injected">,
  SessionEvent<"tools_resolved">,
  SessionEvent<"model_request_started">
]

export class PromptAssembler {
  readonly #requestIdFactory: () => string
  readonly #tokenEstimator: (content: string) => number
  readonly #checksumFactory: (content: string) => string

  constructor(options: PromptAssemblerOptions = {}) {
    this.#requestIdFactory = options.requestIdFactory ?? (() => `req_${randomUUID()}`)
    this.#tokenEstimator = options.tokenEstimator ?? estimateTokens
    this.#checksumFactory = options.checksumFactory ?? sha256Checksum
  }

  assemble(input: AssemblePromptInput): PromptBundle {
    const resolvedLayers = input.layers
      .filter((layer) => layer.enabled)
      .slice()
      .sort(comparePromptLayers)
    const layerResults = resolvedLayers.map((layer) => this.#resolveLayer(layer))
    const toolDefinitions = [...(input.toolDefinitions ?? [])]

    return {
      requestId: input.requestId ?? this.#requestIdFactory(),
      model: input.model,
      modelRole: input.modelRole,
      messages: layerResults.map(({ layer }) => toPromptMessage(layer)),
      toolDefinitions,
      layers: layerResults.map(({ snapshot }) => snapshot),
      injectedMemoryIds: [...(input.injectedMemoryIds ?? [])],
      enabledSkillIds: [...(input.enabledSkillIds ?? [])],
      enabledToolIds: [...(input.enabledToolIds ?? toolDefinitions.map((tool) => tool.id))],
      tokenEstimate: layerResults.reduce((total, result) => total + result.tokenEstimate, 0),
      warnings: layerResults.flatMap((result) => result.warnings)
    }
  }

  async recordPromptBundleEvents(
    input: RecordPromptBundleEventsInput
  ): Promise<RecordedPromptBundleEvents> {
    const actor = input.actor ?? "system"
    const common = {
      sessionId: input.sessionId,
      actor,
      correlationId: input.correlationId
    }

    return [
      await input.log.append({
        ...common,
        type: "prompt_layers_resolved",
        payload: {
          requestId: input.bundle.requestId,
          layers: input.bundle.layers,
          tokenEstimate: input.bundle.tokenEstimate,
          warnings: input.bundle.warnings
        }
      }),
      await input.log.append({
        ...common,
        type: "memory_injected",
        payload: {
          requestId: input.bundle.requestId,
          memoryIds: input.bundle.injectedMemoryIds
        }
      }),
      await input.log.append({
        ...common,
        type: "tools_resolved",
        payload: {
          requestId: input.bundle.requestId,
          tools: input.bundle.toolDefinitions
        }
      }),
      await input.log.append({
        ...common,
        type: "model_request_started",
        payload: {
          requestId: input.bundle.requestId,
          model: input.bundle.model,
          modelRole: input.bundle.modelRole
        }
      })
    ]
  }

  #resolveLayer(layer: PromptLayerInput): {
    readonly layer: PromptLayerInput
    readonly snapshot: PromptLayerSnapshot
    readonly tokenEstimate: number
    readonly warnings: readonly string[]
  } {
    const tokenEstimate = this.#tokenEstimator(layer.content)
    const warnings =
      layer.tokenBudget !== undefined && tokenEstimate > layer.tokenBudget
        ? [
            `Prompt layer ${layer.id} exceeds tokenBudget: estimated ${tokenEstimate} > ${layer.tokenBudget}`
          ]
        : []

    return {
      layer,
      snapshot: {
        id: layer.id,
        source: layer.source,
        priority: layer.priority,
        enabled: layer.enabled,
        editable: layer.editable,
        tokenBudget: layer.tokenBudget,
        version: layer.version,
        checksum: layer.checksum ?? this.#checksumFactory(layer.content)
      },
      tokenEstimate,
      warnings
    }
  }
}

function comparePromptLayers(left: PromptLayerInput, right: PromptLayerInput): number {
  if (left.priority !== right.priority) {
    return left.priority - right.priority
  }

  return left.id.localeCompare(right.id)
}

function toPromptMessage(layer: PromptLayerInput): PromptMessage {
  return {
    role: "system",
    layerId: layer.id,
    content: layer.content
  }
}

function estimateTokens(content: string): number {
  const trimmedContent = content.trim()
  if (trimmedContent.length === 0) {
    return 0
  }

  return Math.ceil(trimmedContent.length / 4)
}

function sha256Checksum(content: string): string {
  return `sha256:${createHash("sha256").update(content, "utf8").digest("hex")}`
}
