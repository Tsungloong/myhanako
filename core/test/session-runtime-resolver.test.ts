import assert from "node:assert/strict"
import test from "node:test"
import { CommandRegistry } from "../src/command-registry.ts"
import { PluginManager } from "../src/plugin-manager.ts"
import { RuntimeResourceLoader } from "../src/runtime-resource-loader.ts"
import { SessionRuntimeResolver } from "../src/session-runtime-resolver.ts"
import { ToolRegistry } from "../src/tool-registry.ts"

test("SessionRuntimeResolver resolves current contributions and reloads resources before session creation", async () => {
  const authStorage = { kind: "auth" }
  const modelRegistry = { kind: "models" }
  const settingsManager = { kind: "settings" }
  const toolRegistry = new ToolRegistry()
  const commandRegistry = new CommandRegistry()
  const pluginManager = new PluginManager({ toolRegistry, commandRegistry })
  const createdLoaders: FakeDefaultResourceLoader[] = []
  const runtimeResourceLoader = new RuntimeResourceLoader({
    cwd: "F:\\workspace",
    agentDir: "F:\\myhanako\\agent",
    createDefaultResourceLoader: (options) => {
      const loader = new FakeDefaultResourceLoader(options)
      createdLoaders.push(loader)
      return loader
    }
  })

  toolRegistry.register({
    id: "workspace.read",
    name: "workspace_read",
    source: "plugin:workspace",
    description: "Read workspace metadata.",
    schemaChecksum: "sha256:workspace-read",
    permissions: ["workspace:read"],
    execute: async () => ({ ok: true })
  })
  pluginManager.loadPlugin({
    manifest: {
      id: "plugin:native",
      name: "Native bridge",
      version: "0.1.0",
      access: "full-access",
      permissions: ["native:bridge"],
      extensions: ["F:\\plugins\\native\\extensions"]
    }
  })

  const resolver = new SessionRuntimeResolver({
    authStorage,
    modelRegistry,
    settingsManager,
    runtimeResourceLoader,
    builtinToolNames: ["read"],
    toolRegistry,
    commandRegistry,
    pluginManager
  })

  const runtime = await resolver.resolve()

  assert.equal(runtime.authStorage, authStorage)
  assert.equal(runtime.modelRegistry, modelRegistry)
  assert.equal(runtime.settingsManager, settingsManager)
  assert.equal(runtime.resourceLoader, createdLoaders[0])
  assert.deepEqual(runtime.tools, ["read", "workspace_read"])
  assert.deepEqual(
    runtime.customTools.map((tool) => tool.name),
    ["workspace_read"]
  )
  assert.deepEqual(createdLoaders[0].options.additionalExtensionPaths, [
    "F:\\plugins\\native\\extensions"
  ])
  assert.deepEqual(runtimeResourceLoader.state?.toolDefinitions, [
    {
      id: "workspace.read",
      name: "workspace_read",
      source: "plugin:workspace",
      description: "Read workspace metadata.",
      schemaChecksum: "sha256:workspace-read",
      permissions: ["workspace:read"]
    }
  ])
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
