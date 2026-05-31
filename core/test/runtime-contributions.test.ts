import assert from "node:assert/strict"
import test from "node:test"
import { CommandRegistry } from "../src/command-registry.ts"
import { ExecutionBoundary } from "../src/execution-boundary.ts"
import {
  resolveRuntimeResourceContributions,
  type RuntimeToolDefinition
} from "../src/runtime-contributions.ts"
import { RuntimeResourceLoader } from "../src/runtime-resource-loader.ts"
import { PluginManager } from "../src/plugin-manager.ts"
import { ResourceAccessService } from "../src/resource-access-service.ts"
import { ToolRegistry } from "../src/tool-registry.ts"

test("resolveRuntimeResourceContributions exposes registry tools as Pi custom tools without exposing slash commands", async () => {
  const toolRegistry = new ToolRegistry()
  const commandRegistry = new CommandRegistry()
  let toolExecutionCount = 0

  toolRegistry.register({
    id: "workspace.read",
    name: "workspace_read",
    source: "plugin:workspace",
    description: "Read workspace metadata.",
    schemaChecksum: "sha256:workspace-read",
    parameters: {
      type: "object",
      properties: {
        target: {
          type: "string",
          description: "Workspace-relative target."
        }
      },
      required: ["target"],
      additionalProperties: false
    },
    permissions: ["workspace:read"],
    execute: async (input) => {
      toolExecutionCount += 1
      return {
        sessionId: input.sessionId,
        toolCallId: input.toolCallId,
        target: input.arguments.target
      }
    }
  })
  commandRegistry.register({
    id: "workspace.status",
    name: "workspace-status",
    source: "plugin",
    sourceId: "plugin:workspace",
    description: "Show workspace plugin status.",
    execute: async () => ({ ok: true })
  })

  const resolved = resolveRuntimeResourceContributions({
    builtinToolNames: ["read", "bash"],
    toolRegistry,
    commandRegistry
  })

  assert.equal(toolExecutionCount, 0)
  assert.deepEqual(resolved.tools, ["read", "bash", "workspace_read"])
  assert.deepEqual(
    resolved.toolDefinitions.map((definition) => definition.name),
    ["workspace_read"]
  )
  assert.deepEqual(
    resolved.commandDefinitions.map((definition) => definition.name),
    ["workspace_status"]
  )
  assert.equal(
    resolved.customTools.some((tool) => tool.name === "workspace_status"),
    false
  )

  const customTool = resolved.customTools[0] as RuntimeToolDefinition
  assert.equal(customTool.name, "workspace_read")
  assert.equal(customTool.label, "workspace_read")
  assert.equal(customTool.description, "Read workspace metadata.")
  assert.deepEqual(customTool.parameters, {
    type: "object",
    properties: {
      target: {
        type: "string",
        description: "Workspace-relative target."
      }
    },
    required: ["target"],
    additionalProperties: false
  })

  const result = await customTool.execute(
    "call_1",
    { target: "README.md" },
    undefined,
    undefined,
    {
      sessionManager: {
        getSessionFile: () => "F:\\myhanako\\sessions\\session.jsonl"
      }
    }
  )

  assert.equal(toolExecutionCount, 1)
  assert.deepEqual(result, {
    content: [
      {
        type: "text",
        text: "{\"sessionId\":\"F:\\\\myhanako\\\\sessions\\\\session.jsonl\",\"toolCallId\":\"call_1\",\"target\":\"README.md\"}"
      }
    ],
    details: {
      sessionId: "F:\\myhanako\\sessions\\session.jsonl",
      toolCallId: "call_1",
      target: "README.md"
    }
  })
})

test("RuntimeResourceLoader forwards resolved plugin extension and skill paths into DefaultResourceLoader", async () => {
  const extensionFactory = () => undefined
  const loader = new RuntimeResourceLoader({
    cwd: "F:\\workspace",
    agentDir: "F:\\myhanako\\agent",
    createDefaultResourceLoader: (options) => new FakeDefaultResourceLoader(options)
  })

  const state = await loader.reload({
    tools: ["read"],
    extensionFactories: [extensionFactory],
    extensionPaths: ["F:\\plugins\\native\\extensions"],
    skillPaths: ["F:\\plugins\\workspace\\skills"]
  })
  const fake = state.resourceLoader as FakeDefaultResourceLoader

  assert.deepEqual(fake.options.extensionFactories, [extensionFactory])
  assert.deepEqual(fake.options.additionalExtensionPaths, ["F:\\plugins\\native\\extensions"])
  assert.deepEqual(fake.options.additionalSkillPaths, ["F:\\plugins\\workspace\\skills"])
  assert.deepEqual(state.extensionPaths, ["F:\\plugins\\native\\extensions"])
  assert.deepEqual(state.skillPaths, ["F:\\plugins\\workspace\\skills"])
})

test("resolveRuntimeResourceContributions forwards per-call execution subjects to registry tools", async () => {
  const toolRegistry = new ToolRegistry({
    executionBoundary: new ExecutionBoundary(new ResourceAccessService())
  })
  let toolExecutionCount = 0
  toolRegistry.register({
    id: "workspace.read",
    name: "workspace_read",
    source: "plugin:workspace",
    description: "Read workspace metadata.",
    schemaChecksum: "sha256:workspace-read",
    permissions: ["workspace:read"],
    execute: async () => {
      toolExecutionCount += 1
      return { ok: true }
    }
  })

  const resolved = resolveRuntimeResourceContributions({
    builtinToolNames: [],
    toolRegistry
  })
  const customTool = resolved.customTools[0] as RuntimeToolDefinition

  const result = await customTool.execute(
    "call_1",
    {},
    undefined,
    undefined,
    {
      executionSubject: {
        type: "plugin",
        id: "plugin:workspace",
        access: "restricted",
        permissions: ["workspace:read"]
      }
    }
  )

  assert.equal(toolExecutionCount, 1)
  assert.deepEqual(result.details, { ok: true })
})

test("resolveRuntimeResourceContributions converts enabled full-access plugin extension declarations into extension paths", () => {
  const manager = new PluginManager({
    toolRegistry: new ToolRegistry(),
    commandRegistry: new CommandRegistry()
  })

  manager.loadPlugin({
    manifest: {
      id: "plugin:native",
      name: "Native bridge",
      version: "0.1.0",
      access: "full-access",
      permissions: ["native:bridge"],
      extensions: ["F:\\plugins\\native\\extensions"]
    }
  })

  const resolved = resolveRuntimeResourceContributions({
    builtinToolNames: [],
    pluginManager: manager
  })

  assert.deepEqual(resolved.extensionPaths, ["F:\\plugins\\native\\extensions"])
  assert.deepEqual(
    resolved.pluginSnapshots.map((plugin) => plugin.id),
    ["plugin:native"]
  )
})

class FakeDefaultResourceLoader {
  readonly options: Record<string, unknown>

  constructor(options: Record<string, unknown>) {
    this.options = options
  }

  async reload(): Promise<void> {}

  getSkills() {
    return {
      skills: [],
      diagnostics: []
    }
  }
}
