import assert from "node:assert/strict"
import test from "node:test"
import {
  AuthStorage,
  DefaultResourceLoader,
  ModelRegistry,
  SessionManager,
  SettingsManager,
  createAgentSession,
  createModelRegistry
} from "../pi-sdk/index.ts"

test("Pi SDK adapter imports project dependencies through the stable boundary", () => {
  assert.equal(typeof createAgentSession, "function")
  assert.equal(typeof createModelRegistry, "function")
  assert.equal(typeof AuthStorage.create, "function")
  assert.equal(typeof ModelRegistry.create, "function")
  assert.equal(typeof SessionManager.create, "function")
  assert.equal(typeof SettingsManager, "function")
  assert.equal(typeof DefaultResourceLoader, "function")
})
