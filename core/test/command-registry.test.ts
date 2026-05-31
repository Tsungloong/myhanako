import assert from "node:assert/strict"
import test from "node:test"
import {
  CommandRegistry,
  type CommandInvocationInput
} from "../src/command-registry.ts"
import {
  InMemorySessionEventStore,
  SessionEventLog
} from "../src/session-event-log.ts"

test("CommandRegistry exposes frontend-safe command snapshots", () => {
  const registry = new CommandRegistry()

  registry.register({
    id: "cmd_status",
    name: "Status",
    aliases: ["state"],
    source: "core",
    sourceId: "builtin",
    description: "Show current session status.",
    usage: "/status",
    scope: "session",
    permission: "owner",
    execute: async () => ({ ok: true })
  })

  assert.deepEqual(registry.listDefinitions(), [
    {
      id: "cmd_status",
      name: "status",
      aliases: ["state"],
      source: "core",
      sourceId: "builtin",
      description: "Show current session status.",
      usage: "/status",
      scope: "session",
      permission: "owner"
    }
  ])
})

test("CommandRegistry normalizes command names and resolves aliases", () => {
  const registry = new CommandRegistry()

  registry.register({
    id: "cmd_diff_review",
    name: "diff-review",
    aliases: ["dr"],
    source: "core",
    description: "Review the current Git diff.",
    execute: async () => ({ ok: true })
  })

  assert.equal(registry.lookup("diff-review")?.name, "diff_review")
  assert.equal(registry.lookup("DIFF_REVIEW")?.name, "diff_review")
  assert.equal(registry.lookup("dr")?.name, "diff_review")
})

test("CommandRegistry blocks plugin and skill attempts to claim core reserved commands", () => {
  const registry = new CommandRegistry()

  assert.equal(
    registry.register(
      {
        id: "cmd_fake_stop",
        name: "stop",
        source: "core",
        description: "Pretend to stop the session.",
        execute: async () => ({ ok: true })
      },
      {
        source: "plugin",
        sourceId: "plugin:untrusted"
      }
    ),
    null
  )

  const handle = registry.register(
    {
      id: "cmd_sneaky",
      name: "sneaky",
      aliases: ["reset", "sneak"],
      source: "core",
      description: "Try to smuggle a reserved alias.",
      execute: async () => ({ ok: true })
    },
    {
      source: "skill",
      sourceId: "skill:untrusted"
    }
  )

  assert.equal(handle?.name, "sneaky")
  assert.equal(registry.lookup("stop"), null)
  assert.equal(registry.lookup("reset"), null)
  assert.equal(registry.lookup("sneak")?.name, "sneaky")
})

test("CommandRegistry can unregister all commands from one source", () => {
  const registry = new CommandRegistry()

  registry.register({
    id: "cmd_plugin_a",
    name: "plugin-a",
    source: "plugin",
    sourceId: "plugin:demo",
    description: "A plugin command.",
    execute: async () => ({ ok: true })
  })
  registry.register({
    id: "cmd_plugin_b",
    name: "plugin-b",
    source: "plugin",
    sourceId: "plugin:demo",
    description: "Another plugin command.",
    execute: async () => ({ ok: true })
  })
  registry.register({
    id: "cmd_core",
    name: "core-cmd",
    source: "core",
    description: "A core command.",
    execute: async () => ({ ok: true })
  })

  assert.equal(registry.unregisterBySource("plugin", "plugin:demo"), 2)
  assert.equal(registry.lookup("plugin-a"), null)
  assert.equal(registry.lookup("plugin-b"), null)
  assert.equal(registry.lookup("core-cmd")?.id, "cmd_core")
})

test("CommandRegistry invokes registered commands and records command_invoked events", async () => {
  const eventLog = new SessionEventLog({
    store: new InMemorySessionEventStore(),
    clock: () => new Date("2026-05-28T00:00:00.000Z"),
    idFactory: (event) => `evt_${event.sequence}`
  })
  const registry = new CommandRegistry()
  const invocations: CommandInvocationInput[] = []

  registry.register({
    id: "cmd_status",
    name: "status",
    source: "core",
    description: "Show current session status.",
    execute: async (input) => {
      invocations.push(input)
      return {
        reply: `status:${input.args}`
      }
    }
  })

  const result = await registry.invoke("/status compact", {
    sessionId: "session_command",
    eventLog,
    arguments: {
      mode: "compact"
    }
  })

  assert.deepEqual(result, {
    handled: true,
    commandId: "cmd_status",
    result: {
      reply: "status:compact"
    }
  })
  assert.equal(invocations[0].commandName, "status")
  assert.equal(invocations[0].args, "compact")

  const events = await eventLog.listSessionEvents("session_command")
  assert.deepEqual(events.map((event) => event.type), ["command_invoked"])
  assert.deepEqual(events[0].payload, {
    commandId: "cmd_status",
    rawInput: "/status compact",
    arguments: {
      mode: "compact"
    }
  })
})

test("CommandRegistry leaves non-command and unknown slash input unhandled", async () => {
  const registry = new CommandRegistry()

  assert.deepEqual(await registry.invoke("status", { sessionId: "session_command" }), {
    handled: false
  })
  assert.deepEqual(await registry.invoke("/missing", { sessionId: "session_command" }), {
    handled: false
  })
})
