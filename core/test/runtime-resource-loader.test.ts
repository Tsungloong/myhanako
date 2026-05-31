import assert from "node:assert/strict"
import test from "node:test"
import {
  RuntimeResourceLoader,
  type RuntimeResourceLoaderOptions
} from "../src/runtime-resource-loader.ts"

test("RuntimeResourceLoader initializes DefaultResourceLoader and exposes session resources", async () => {
  const settingsManager = { kind: "settings" }
  const eventBus = { kind: "events" }
  const tool = { name: "read" }
  const customTool = { name: "project_status" }
  const extensionFactory = () => undefined
  const runtimeSkill = createSkill("runtime-skill")
  const createdLoaders: FakeDefaultResourceLoader[] = []
  const loader = new RuntimeResourceLoader({
    cwd: "F:\\workspace",
    agentDir: "F:\\myhanako\\agent",
    settingsManager,
    eventBus,
    createDefaultResourceLoader(options) {
      const fake = new FakeDefaultResourceLoader(options)
      createdLoaders.push(fake)
      return fake
    }
  })

  const state = await loader.reload({
    tools: [tool],
    customTools: [customTool],
    extensionFactories: [extensionFactory],
    skills: [runtimeSkill]
  })

  assert.equal(createdLoaders.length, 1)
  assert.equal(createdLoaders[0].reloadCount, 1)
  assert.equal(createdLoaders[0].options.cwd, "F:\\workspace")
  assert.equal(createdLoaders[0].options.agentDir, "F:\\myhanako\\agent")
  assert.equal(createdLoaders[0].options.settingsManager, settingsManager)
  assert.equal(createdLoaders[0].options.eventBus, eventBus)
  assert.deepEqual(createdLoaders[0].options.extensionFactories, [extensionFactory])
  assert.deepEqual(state.tools, [tool])
  assert.deepEqual(state.customTools, [customTool])
  assert.deepEqual(state.skills.map((skill) => skill.name), ["base-skill", "runtime-skill"])
  assert.deepEqual(state.diagnostics, [{ message: "base diagnostic" }])
  assert.deepEqual(loader.toSessionRuntime(), {
    resourceLoader: createdLoaders[0],
    tools: [tool],
    customTools: [customTool]
  })
})

test("RuntimeResourceLoader keeps immutable snapshots and requires reload before session runtime access", async () => {
  const tools = [{ name: "read" }]
  const customTools = [{ name: "project_status" }]
  const loader = new RuntimeResourceLoader({
    cwd: "F:\\workspace",
    agentDir: "F:\\myhanako\\agent",
    createDefaultResourceLoader: (options) => new FakeDefaultResourceLoader(options)
  })

  assert.throws(
    () => loader.toSessionRuntime(),
    /RuntimeResourceLoader.reload\(\) must complete before session runtime resources are read/
  )

  const state = await loader.reload({ tools, customTools })
  tools.push({ name: "write" })
  customTools.push({ name: "unsafe_status" })

  assert.deepEqual(state.tools, [{ name: "read" }])
  assert.deepEqual(state.customTools, [{ name: "project_status" }])
  assert.deepEqual(loader.toSessionRuntime().tools, [{ name: "read" }])
  assert.deepEqual(loader.toSessionRuntime().customTools, [{ name: "project_status" }])
})

test("RuntimeResourceLoader exposes resolved transparency snapshots after reload", async () => {
  const toolDefinition = {
    id: "workspace.read",
    name: "workspace_read",
    source: "plugin:workspace",
    description: "Read workspace metadata.",
    schemaChecksum: "sha256:workspace-read",
    permissions: ["workspace:read"]
  }
  const commandDefinition = {
    id: "workspace.status",
    name: "workspace_status",
    source: "plugin:workspace",
    description: "Show workspace status.",
    aliases: []
  }
  const pluginSnapshot = {
    id: "plugin:workspace",
    status: "enabled"
  }
  const loader = new RuntimeResourceLoader({
    cwd: "F:\\workspace",
    agentDir: "F:\\myhanako\\agent",
    createDefaultResourceLoader: (options) => new FakeDefaultResourceLoader(options)
  })

  assert.throws(
    () => loader.toTransparencySnapshot(),
    /RuntimeResourceLoader.reload\(\) must complete before transparency snapshot is read/
  )

  await loader.reload({
    toolDefinitions: [toolDefinition],
    commandDefinitions: [commandDefinition],
    pluginSnapshots: [pluginSnapshot],
    skills: [createSkill("runtime-skill")],
    diagnostics: [{ message: "runtime diagnostic" }],
    skillPaths: ["F:\\plugins\\workspace\\skills"],
    extensionPaths: ["F:\\plugins\\native\\extensions"]
  })

  const snapshot = loader.toTransparencySnapshot()

  assert.deepEqual(snapshot.toolDefinitions, [toolDefinition])
  assert.deepEqual(snapshot.commandDefinitions, [commandDefinition])
  assert.deepEqual(snapshot.pluginSnapshots, [pluginSnapshot])
  assert.deepEqual(snapshot.skills.map((skill) => skill.name), ["base-skill", "runtime-skill"])
  assert.deepEqual(snapshot.diagnostics, [
    { message: "base diagnostic" },
    { message: "runtime diagnostic" }
  ])
  assert.deepEqual(snapshot.skillPaths, ["F:\\plugins\\workspace\\skills"])
  assert.deepEqual(snapshot.extensionPaths, ["F:\\plugins\\native\\extensions"])

  ;(snapshot.toolDefinitions as unknown[]).push({ id: "mutated" })
  assert.deepEqual(loader.toTransparencySnapshot().toolDefinitions, [toolDefinition])
})

function createSkill(name: string) {
  return {
    name,
    description: `${name} description`,
    filePath: `F:\\skills\\${name}\\SKILL.md`,
    baseDir: `F:\\skills\\${name}`,
    sourceInfo: { source: "test" },
    disableModelInvocation: false
  }
}

class FakeDefaultResourceLoader {
  readonly options: RuntimeResourceLoaderOptions["createDefaultResourceLoader"] extends (options: infer Options) => unknown
    ? Options
    : never
  reloadCount = 0

  constructor(options: FakeDefaultResourceLoader["options"]) {
    this.options = options
  }

  async reload(): Promise<void> {
    this.reloadCount += 1
  }

  getSkills() {
    return this.options.skillsOverride?.({
      skills: [createSkill("base-skill")],
      diagnostics: [{ message: "base diagnostic" }]
    }) ?? {
      skills: [createSkill("base-skill")],
      diagnostics: [{ message: "base diagnostic" }]
    }
  }
}
