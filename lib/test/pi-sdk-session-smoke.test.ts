import assert from "node:assert/strict"
import { mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"
import {
  AuthStorage,
  DefaultResourceLoader,
  ModelRegistry,
  SessionManager,
  SettingsManager,
  createAgentSession
} from "../pi-sdk/index.ts"

test("Pi SDK adapter can create a real session without using global pi CLI", async () => {
  const rootDir = await mkdtemp(path.join(tmpdir(), "myhanako-pi-session-"))
  const cwd = path.join(rootDir, "workspace")
  const agentDir = path.join(rootDir, "agent")
  const settingsManager = SettingsManager.inMemory({
    defaultThinkingLevel: "off"
  })
  const authStorage = AuthStorage.inMemory()
  const modelRegistry = ModelRegistry.inMemory(authStorage)
  const resourceLoader = new DefaultResourceLoader({
    cwd,
    agentDir,
    settingsManager,
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
    systemPrompt: ""
  })
  await resourceLoader.reload()

  const sessionManager = SessionManager.inMemory(cwd)
  const model = {
    id: "myhanako-smoke-model",
    provider: "myhanako-smoke",
    name: "myhanako smoke model",
    api: "openai-completions",
    contextWindow: 8192,
    maxTokens: 1024,
    reasoning: false,
    input: ["text"],
    output: ["text"]
  }

  const { session } = await createAgentSession({
    cwd,
    agentDir,
    authStorage,
    modelRegistry,
    settingsManager,
    sessionManager,
    resourceLoader,
    model,
    thinkingLevel: "off",
    tools: [],
    customTools: []
  })

  assert.equal(session.sessionManager, sessionManager)
  assert.equal(session.model?.id, "myhanako-smoke-model")
  const unsubscribe = session.subscribe(() => undefined)
  unsubscribe()
  session.dispose()
})
