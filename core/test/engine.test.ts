import assert from "node:assert/strict"
import test from "node:test"
import { Engine } from "../src/engine.ts"

test("Engine delegates session lifecycle to SessionCoordinator as a thin facade", async () => {
  const calls: unknown[] = []
  const sessionCoordinator = {
    async createSession(options: unknown) {
      calls.push(["createSession", options])
      return { sessionId: "session-created" }
    },
    async recoverSession(options: unknown) {
      calls.push(["recoverSession", options])
      return { sessionId: "session-recovered" }
    },
    async disposeCurrentSession(reason: string) {
      calls.push(["disposeCurrentSession", reason])
    }
  }
  const modelManager = { kind: "models" }
  const resourceLoader = { kind: "resources" }
  const engine = new Engine({
    sessionCoordinator,
    modelManager,
    resourceLoader
  })

  assert.equal(engine.modelManager, modelManager)
  assert.equal(engine.resourceLoader, resourceLoader)
  assert.deepEqual(await engine.createSession({ cwd: "F:\\workspace" }), {
    sessionId: "session-created"
  })
  assert.deepEqual(await engine.recoverSession({ sessionFile: "session.jsonl" }), {
    sessionId: "session-recovered"
  })
  await engine.disposeCurrentSession("done")

  assert.deepEqual(calls, [
    ["createSession", { cwd: "F:\\workspace" }],
    ["recoverSession", { sessionFile: "session.jsonl" }],
    ["disposeCurrentSession", "done"]
  ])
})
