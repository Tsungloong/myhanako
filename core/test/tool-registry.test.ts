import assert from "node:assert/strict"
import test from "node:test"
import { ToolRegistry } from "../src/tool-registry.ts"

test("ToolRegistry exposes registered tools as transparent snapshots", () => {
  const registry = new ToolRegistry()

  registry.register({
    id: "tool_read",
    name: "read_file",
    source: "builtin",
    description: "Read a workspace file.",
    schemaChecksum: "sha256:schema",
    permissions: ["workspace:read"],
    execute: async () => ({ ok: true })
  })

  assert.deepEqual(registry.listDefinitions(), [
    {
      id: "tool_read",
      name: "read_file",
      source: "builtin",
      description: "Read a workspace file.",
      schemaChecksum: "sha256:schema",
      permissions: ["workspace:read"]
    }
  ])
})

test("ToolRegistry rejects duplicate tool ids", () => {
  const registry = new ToolRegistry()
  const tool = {
    id: "tool_read",
    name: "read_file",
    source: "builtin",
    description: "Read a workspace file.",
    schemaChecksum: "sha256:schema",
    permissions: ["workspace:read"],
    execute: async () => ({ ok: true })
  }

  registry.register(tool)

  assert.throws(() => registry.register(tool), /Tool already registered: tool_read/)
})

test("ToolRegistry allows description overrides without mutating schema or permissions", () => {
  const registry = new ToolRegistry()

  registry.register({
    id: "tool_write",
    name: "write_file",
    source: "builtin",
    description: "Write a workspace file.",
    schemaChecksum: "sha256:original-schema",
    permissions: ["workspace:write"],
    execute: async () => ({ ok: true })
  })

  const definitions = registry.listDefinitions({
    descriptionOverrides: {
      tool_write: {
        description: "Safely write a workspace file after diff approval.",
        schemaChecksum: "sha256:attempted-schema-change",
        permissions: ["terminal:run"]
      }
    }
  })

  assert.deepEqual(definitions, [
    {
      id: "tool_write",
      name: "write_file",
      source: "builtin",
      description: "Safely write a workspace file after diff approval.",
      schemaChecksum: "sha256:original-schema",
      permissions: ["workspace:write"]
    }
  ])
})

test("ToolRegistry invokes registered executors through the registry boundary", async () => {
  const registry = new ToolRegistry()

  registry.register({
    id: "tool_echo",
    name: "echo",
    source: "builtin",
    description: "Echo arguments.",
    schemaChecksum: "sha256:schema",
    permissions: [],
    execute: async (input) => ({
      echoed: input.arguments.message
    })
  })

  const result = await registry.execute("tool_echo", {
    sessionId: "session_tool",
    toolCallId: "call_1",
    arguments: {
      message: "hello"
    }
  })

  assert.deepEqual(result, { echoed: "hello" })
  await assert.rejects(
    registry.execute("missing_tool", {
      sessionId: "session_tool",
      toolCallId: "call_2",
      arguments: {}
    }),
    /Tool not registered: missing_tool/
  )
})
