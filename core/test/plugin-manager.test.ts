import assert from "node:assert/strict"
import { mkdir, mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"
import { CommandRegistry } from "../src/command-registry.ts"
import { PluginManager } from "../src/plugin-manager.ts"
import { ToolRegistry } from "../src/tool-registry.ts"

test("PluginManager registers restricted plugin tools and commands through registries", async () => {
  const toolRegistry = new ToolRegistry()
  const commandRegistry = new CommandRegistry()
  const manager = new PluginManager({ toolRegistry, commandRegistry })

  const plugin = manager.loadPlugin({
    manifest: {
      id: "plugin:workspace",
      name: "Workspace helpers",
      version: "0.1.0",
      access: "restricted",
      permissions: ["workspace:read", "tool:register", "command:register"]
    },
    tools: [
      {
        id: "workspace.read",
        name: "workspace_read",
        description: "Read workspace metadata.",
        schemaChecksum: "sha256:workspace-read",
        permissions: ["workspace:read"],
        execute: async () => ({ ok: true })
      }
    ],
    commands: [
      {
        id: "workspace.status",
        name: "workspace-status",
        description: "Show workspace plugin status.",
        execute: async () => ({ ok: true })
      }
    ]
  })

  assert.equal(plugin.id, "plugin:workspace")
  assert.equal(manager.listPlugins()[0].status, "enabled")
  assert.deepEqual(toolRegistry.listDefinitions(), [
    {
      id: "workspace.read",
      name: "workspace_read",
      source: "plugin:workspace",
      description: "Read workspace metadata.",
      schemaChecksum: "sha256:workspace-read",
      permissions: ["workspace:read"]
    }
  ])
  assert.equal(commandRegistry.lookup("workspace-status")?.source, "plugin")
  assert.equal(commandRegistry.lookup("workspace-status")?.sourceId, "plugin:workspace")
})

test("PluginManager rejects restricted plugins that declare full-access capabilities", () => {
  const manager = new PluginManager({
    toolRegistry: new ToolRegistry(),
    commandRegistry: new CommandRegistry()
  })

  assert.throws(
    () =>
      manager.loadPlugin({
        manifest: {
          id: "plugin:unsafe",
          name: "Unsafe plugin",
          version: "0.1.0",
          access: "restricted",
          permissions: ["command:register"],
          routes: ["/api/unsafe"],
          extensions: ["extensions/native"]
        }
      }),
    /Restricted plugin cannot declare full-access capabilities: plugin:unsafe/
  )
})

test("PluginManager keeps full-access declarations as metadata without executing extension code", () => {
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
      permissions: ["network:access"],
      routes: ["/api/native"],
      providers: ["native-provider"],
      extensions: ["extensions/native"]
    }
  })

  assert.deepEqual(manager.listPlugins(), [
    {
      id: "plugin:native",
      name: "Native bridge",
      version: "0.1.0",
      access: "full-access",
      status: "enabled",
      permissions: ["network:access"],
      routes: ["/api/native"],
      providers: ["native-provider"],
      extensions: ["extensions/native"]
    }
  ])
})

test("PluginManager disables a plugin and unregisters its contributions", () => {
  const toolRegistry = new ToolRegistry()
  const commandRegistry = new CommandRegistry()
  const manager = new PluginManager({ toolRegistry, commandRegistry })

  manager.loadPlugin({
    manifest: {
      id: "plugin:temporary",
      name: "Temporary plugin",
      version: "0.1.0",
      access: "restricted",
      permissions: ["tool:register", "command:register"]
    },
    tools: [
      {
        id: "temporary.echo",
        name: "temporary_echo",
        description: "Echo.",
        schemaChecksum: "sha256:echo",
        permissions: [],
        execute: async () => ({ ok: true })
      }
    ],
    commands: [
      {
        id: "temporary.echo",
        name: "temporary-echo",
        description: "Echo.",
        execute: async () => ({ ok: true })
      }
    ]
  })

  assert.equal(manager.disablePlugin("plugin:temporary"), true)
  assert.deepEqual(toolRegistry.listDefinitions(), [])
  assert.equal(commandRegistry.lookup("temporary-echo"), null)
  assert.equal(manager.listPlugins()[0].status, "disabled")
})
test("PluginManager rolls back registry contributions when plugin loading fails", () => {
  const toolRegistry = new ToolRegistry()
  const commandRegistry = new CommandRegistry()
  const manager = new PluginManager({ toolRegistry, commandRegistry })

  assert.throws(
    () =>
      manager.loadPlugin({
        manifest: {
          id: "plugin:broken",
          name: "Broken plugin",
          version: "0.1.0",
          access: "restricted",
          permissions: ["tool:register"]
        },
        tools: [
          {
            id: "broken.echo",
            name: "broken_echo",
            description: "Echo once.",
            schemaChecksum: "sha256:echo-one",
            permissions: [],
            execute: async () => ({ ok: true })
          },
          {
            id: "broken.echo",
            name: "broken_echo_duplicate",
            description: "Duplicate echo.",
            schemaChecksum: "sha256:echo-two",
            permissions: [],
            execute: async () => ({ ok: true })
          }
        ]
      }),
    /Tool already registered: broken.echo/
  )

  assert.deepEqual(manager.listPlugins(), [])
  assert.deepEqual(toolRegistry.listDefinitions(), [])
})

test("PluginManager discovers and loads local plugin manifests without executing runtime declarations", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "myhanako-plugins-"))
  const workspacePluginDir = join(rootDir, "workspace")
  const nativePluginDir = join(rootDir, "native")

  await mkdir(workspacePluginDir)
  await mkdir(join(nativePluginDir, ".codex-plugin"), { recursive: true })
  await writeFile(
    join(workspacePluginDir, "plugin.json"),
    JSON.stringify({
      id: "plugin:workspace",
      name: "Workspace helpers",
      version: "0.1.0",
      access: "restricted",
      permissions: ["workspace:read"]
    })
  )
  await writeFile(
    join(nativePluginDir, ".codex-plugin", "plugin.json"),
    JSON.stringify({
      id: "plugin:native",
      name: "Native bridge",
      version: "0.1.0",
      access: "full-access",
      permissions: ["network:access"],
      runtime: "index.ts",
      extensions: ["extensions/native"]
    })
  )

  const manager = new PluginManager({
    toolRegistry: new ToolRegistry(),
    commandRegistry: new CommandRegistry()
  })

  const loadedPlugins = await manager.loadLocalPlugins([rootDir])

  assert.deepEqual(
    loadedPlugins.map((plugin) => plugin.id),
    ["plugin:native", "plugin:workspace"]
  )
  assert.deepEqual(manager.listPlugins(), [
    {
      id: "plugin:native",
      name: "Native bridge",
      version: "0.1.0",
      access: "full-access",
      status: "enabled",
      permissions: ["network:access"],
      extensions: ["extensions/native"]
    },
    {
      id: "plugin:workspace",
      name: "Workspace helpers",
      version: "0.1.0",
      access: "restricted",
      status: "enabled",
      permissions: ["workspace:read"]
    }
  ])
})
