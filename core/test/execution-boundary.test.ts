import assert from "node:assert/strict"
import test from "node:test"
import { ExecutionBoundary } from "../src/execution-boundary.ts"
import { ResourceAccessService } from "../src/resource-access-service.ts"
import { ToolRegistry } from "../src/tool-registry.ts"

test("ExecutionBoundary rejects a tool before its executor when permission is missing", async () => {
  let executorCalled = false
  const registry = new ToolRegistry({
    executionBoundary: new ExecutionBoundary(new ResourceAccessService())
  })

  registry.register({
    id: "tool_shell",
    name: "shell",
    source: "builtin",
    description: "Run a terminal command.",
    schemaChecksum: "sha256:schema",
    permissions: ["terminal:run"],
    execute: async () => {
      executorCalled = true
      return { ok: true }
    }
  })

  await assert.rejects(
    registry.execute(
      "tool_shell",
      {
        sessionId: "session_security",
        toolCallId: "call_denied",
        arguments: {}
      },
      {
        subject: {
          type: "plugin",
          id: "plugin:restricted",
          access: "restricted",
          permissions: ["workspace:read"]
        }
      }
    ),
    /Permission not granted: terminal:run/
  )
  assert.equal(executorCalled, false)
})

test("ExecutionBoundary requires an explicit execution subject", async () => {
  let executorCalled = false
  const registry = new ToolRegistry({
    executionBoundary: new ExecutionBoundary(new ResourceAccessService())
  })

  registry.register({
    id: "tool_read",
    name: "read_file",
    source: "builtin",
    description: "Read a workspace file.",
    schemaChecksum: "sha256:schema",
    permissions: ["workspace:read"],
    execute: async () => {
      executorCalled = true
      return { ok: true }
    }
  })

  await assert.rejects(
    registry.execute("tool_read", {
      sessionId: "session_security",
      toolCallId: "call_missing_subject",
      arguments: {}
    }),
    /Execution subject required: tool_read/
  )
  assert.equal(executorCalled, false)
})

test("ExecutionBoundary permits tool execution when the subject grants tool permissions", async () => {
  const registry = new ToolRegistry({
    executionBoundary: new ExecutionBoundary(new ResourceAccessService())
  })

  registry.register({
    id: "tool_read",
    name: "read_file",
    source: "builtin",
    description: "Read a workspace file.",
    schemaChecksum: "sha256:schema",
    permissions: ["workspace:read"],
    execute: async (input) => ({ path: input.arguments.path })
  })

  const result = await registry.execute(
    "tool_read",
    {
      sessionId: "session_security",
      toolCallId: "call_allowed",
      arguments: {
        path: "README.md"
      }
    },
    {
      subject: {
        type: "plugin",
        id: "plugin:reader",
        access: "restricted",
        permissions: ["workspace:read"]
      }
    }
  )

  assert.deepEqual(result, { path: "README.md" })
})
