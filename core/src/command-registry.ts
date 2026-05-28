import type { JsonObject, JsonValue } from "../../shared/src/session-events.ts"
import type { SessionEventLog } from "./session-event-log.ts"

export type CommandPermission = "anyone" | "owner" | "admin"
export type CommandScope = "session" | "agent" | "global"
export type CommandSource = "core" | "plugin" | "skill"

export type CommandDefinitionSnapshot = {
  readonly id: string
  readonly name: string
  readonly aliases: readonly string[]
  readonly source: CommandSource
  readonly sourceId?: string
  readonly description: string
  readonly usage?: string
  readonly scope: CommandScope
  readonly permission: CommandPermission
}

export type CommandInvocationInput = {
  readonly sessionId: string
  readonly rawInput: string
  readonly commandName: string
  readonly args: string
  readonly arguments?: JsonObject
}

export type CommandExecutor = (input: CommandInvocationInput) => Promise<JsonValue>

export type CommandRegistration = Omit<CommandDefinitionSnapshot, "name" | "aliases" | "scope" | "permission"> & {
  readonly name: string
  readonly aliases?: readonly string[]
  readonly scope?: CommandScope
  readonly permission?: CommandPermission
  readonly execute: CommandExecutor
}

export type CommandRegistrationMeta = {
  readonly source?: CommandSource
  readonly sourceId?: string
}

export type CommandRegistrationHandle = {
  readonly name: string
  readonly sourceKey: string
}

export type CommandInvokeOptions = {
  readonly sessionId: string
  readonly eventLog?: SessionEventLog
  readonly arguments?: JsonObject
}

export type CommandInvokeResult =
  | {
      readonly handled: false
    }
  | {
      readonly handled: true
      readonly commandId: string
      readonly result: JsonValue
    }

const COMMAND_RE = /^\s*\/([a-zA-Z0-9_-]+)(?:\s+([\s\S]*?))?\s*$/
const MAX_COMMAND_NAME_LENGTH = 32

const CORE_RESERVED_NAMES = new Set([
  "stop",
  "new",
  "reset",
  "compact",
  "fresh_compact",
  "help",
  "status",
  "rc",
  "exitrc"
])

type StoredCommand = CommandDefinitionSnapshot & {
  readonly execute: CommandExecutor
}

export class CommandRegistry {
  readonly #byName = new Map<string, StoredCommand>()
  readonly #bySource = new Map<string, Set<string>>()

  register(
    command: CommandRegistration,
    meta: CommandRegistrationMeta = {}
  ): CommandRegistrationHandle | null {
    const baseName = normalizeCommandName(command.name)
    if (!baseName) {
      throw new Error("Command name required")
    }

    const gateSource = meta.source ?? command.source
    const sourceId = meta.sourceId ?? command.sourceId
    if (gateSource !== "core" && CORE_RESERVED_NAMES.has(baseName)) {
      return null
    }

    let finalName = baseName
    let suffix = 2
    while (this.#byName.has(finalName)) {
      finalName = `${baseName}_${suffix++}`
    }

    const stored: StoredCommand = {
      id: command.id,
      name: finalName,
      aliases: normalizeAliases(command.aliases ?? [], gateSource),
      source: gateSource,
      sourceId,
      description: command.description,
      usage: command.usage,
      scope: command.scope ?? "session",
      permission: command.permission ?? "owner",
      execute: command.execute
    }

    this.#byName.set(finalName, stored)
    for (const alias of stored.aliases) {
      if (!this.#byName.has(alias)) {
        this.#byName.set(alias, stored)
      }
    }

    const sourceKey = toSourceKey(stored.source, stored.sourceId)
    const sourceNames = this.#bySource.get(sourceKey) ?? new Set<string>()
    sourceNames.add(finalName)
    this.#bySource.set(sourceKey, sourceNames)

    return {
      name: finalName,
      sourceKey
    }
  }

  lookup(rawName: string): CommandDefinitionSnapshot | null {
    const command = this.#byName.get(normalizeCommandName(rawName))
    return command ? toCommandDefinition(command) : null
  }

  listDefinitions(): readonly CommandDefinitionSnapshot[] {
    return Array.from(new Set(this.#byName.values()))
      .map(toCommandDefinition)
      .sort((left, right) => left.name.localeCompare(right.name))
  }

  unregisterBySource(source: CommandSource, sourceId?: string): number {
    const sourceKey = toSourceKey(source, sourceId)
    const names = this.#bySource.get(sourceKey)
    if (!names) {
      return 0
    }

    let count = 0
    for (const name of Array.from(names)) {
      if (this.#unregisterName(name)) {
        count += 1
      }
    }
    this.#bySource.delete(sourceKey)
    return count
  }

  async invoke(rawInput: string, options: CommandInvokeOptions): Promise<CommandInvokeResult> {
    const parsed = parseCommandInput(rawInput)
    if (!parsed) {
      return { handled: false }
    }

    const command = this.#byName.get(normalizeCommandName(parsed.commandName))
    if (!command) {
      return { handled: false }
    }

    await options.eventLog?.append({
      sessionId: options.sessionId,
      type: "command_invoked",
      actor: "user",
      payload: {
        commandId: command.id,
        rawInput,
        ...(options.arguments ? { arguments: options.arguments } : {})
      }
    })

    const result = await command.execute({
      sessionId: options.sessionId,
      rawInput,
      commandName: command.name,
      args: parsed.args,
      arguments: options.arguments
    })

    return {
      handled: true,
      commandId: command.id,
      result
    }
  }

  #unregisterName(name: string): boolean {
    const command = this.#byName.get(name)
    if (!command) {
      return false
    }

    this.#byName.delete(command.name)
    for (const alias of command.aliases) {
      if (this.#byName.get(alias) === command) {
        this.#byName.delete(alias)
      }
    }
    return true
  }
}

function parseCommandInput(rawInput: string): { commandName: string; args: string } | null {
  const match = COMMAND_RE.exec(rawInput)
  if (!match) {
    return null
  }

  return {
    commandName: match[1],
    args: match[2] ?? ""
  }
}

function normalizeAliases(aliases: readonly string[], source: CommandSource): readonly string[] {
  const normalizedAliases: string[] = []
  for (const alias of aliases) {
    const normalized = normalizeCommandName(alias)
    if (!normalized) {
      continue
    }
    if (source !== "core" && CORE_RESERVED_NAMES.has(normalized)) {
      continue
    }
    if (!normalizedAliases.includes(normalized)) {
      normalizedAliases.push(normalized)
    }
  }
  return normalizedAliases
}

function normalizeCommandName(rawName: string): string {
  return rawName
    .trim()
    .toLowerCase()
    .replace(/-/g, "_")
    .replace(/[^a-z0-9_]/g, "_")
    .slice(0, MAX_COMMAND_NAME_LENGTH)
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_")
}

function toCommandDefinition(command: StoredCommand): CommandDefinitionSnapshot {
  return {
    id: command.id,
    name: command.name,
    aliases: [...command.aliases],
    source: command.source,
    sourceId: command.sourceId,
    description: command.description,
    usage: command.usage,
    scope: command.scope,
    permission: command.permission
  }
}

function toSourceKey(source: CommandSource, sourceId?: string): string {
  return `${source}:${sourceId ?? ""}`
}
