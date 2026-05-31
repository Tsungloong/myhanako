import assert from "node:assert/strict"
import test from "node:test"
import {
  PI_BUILTIN_TOOL_NAMES,
  normalizeCreateAgentSessionOptions
} from "../pi-sdk/session-options.ts"

test("Pi SDK adapter exposes the OpenHanako built-in tool allowlist", () => {
  assert.deepEqual(PI_BUILTIN_TOOL_NAMES, [
    "read",
    "write",
    "edit",
    "bash",
    "grep",
    "find",
    "ls"
  ])
})

test("normalizeCreateAgentSessionOptions converts agent tools to Pi SDK name allowlist", () => {
  const readTool = {
    name: "read",
    label: "Read",
    description: "Read a file",
    parameters: { type: "object" },
    execute: async () => "ok"
  }
  const customTool = {
    name: "custom_search",
    description: "Search"
  }

  const normalized = normalizeCreateAgentSessionOptions({
    cwd: "F:\\Codex-Workspace\\myhanako",
    tools: [readTool],
    customTools: [customTool]
  }, "0.70.2")

  assert.deepEqual(normalized.tools, ["read", "custom_search"])
  assert.equal(normalized.customTools.length, 2)
  assert.equal(normalized.customTools[0].name, "read")
  assert.equal(normalized.customTools[0].description, "Read a file")
  assert.equal(normalized.customTools[1], customTool)
})

test("normalizeCreateAgentSessionOptions rejects invalid agent tools before session creation", () => {
  assert.throws(
    () => normalizeCreateAgentSessionOptions({
      tools: [{ name: "read" }]
    }, "0.70.2"),
    /must have an execute function/
  )
  assert.throws(
    () => normalizeCreateAgentSessionOptions({
      customTools: [{ description: "missing name" }]
    }, "0.70.2"),
    /non-empty string name/
  )
})
