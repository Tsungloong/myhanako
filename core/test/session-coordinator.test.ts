import assert from "node:assert/strict"
import test from "node:test"
import { SessionCoordinator } from "../src/session-coordinator.ts"

test("SessionCoordinator creates sessions through the Pi SDK adapter with an explicit model", async () => {
  const session = createFakeSession("F:\\myhanako\\sessions\\session-created.jsonl")
  const eventSinkEvents: unknown[] = []
  const mirrorEvents: unknown[] = []
  const createAgentSessionCalls: Record<string, unknown>[] = []
  const coordinator = new SessionCoordinator({
    createAgentSession: async (options) => {
      createAgentSessionCalls.push(options)
      return { session }
    },
    sessionManagers: {
      create(cwd, sessionDir) {
        assert.equal(cwd, "F:\\workspace")
        assert.equal(sessionDir, "F:\\myhanako\\sessions")
        return {
          getSessionFile: () => "F:\\myhanako\\sessions\\session-created.jsonl"
        }
      }
    },
    runtime: {
      authStorage: { kind: "auth" },
      modelRegistry: { kind: "models" },
      resourceLoader: { kind: "resources" },
      settingsManager: { kind: "settings" },
      tools: [{ name: "read" }],
      customTools: [{ name: "project_status" }]
    },
    eventSink: (event) => eventSinkEvents.push(event),
    eventLog: {
      append: async (event) => {
        mirrorEvents.push(event)
      }
    }
  })

  const state = await coordinator.createSession({
    cwd: "F:\\workspace",
    sessionDir: "F:\\myhanako\\sessions",
    model: { id: "gpt-4.1", provider: "openai" },
    thinkingLevel: "high"
  })

  assert.equal(state.session, session)
  assert.equal(createAgentSessionCalls.length, 1)
  assert.deepEqual(createAgentSessionCalls[0], {
    cwd: "F:\\workspace",
    sessionManager: {
      getSessionFile: createAgentSessionCalls[0].sessionManager.getSessionFile
    },
    authStorage: { kind: "auth" },
    modelRegistry: { kind: "models" },
    resourceLoader: { kind: "resources" },
    settingsManager: { kind: "settings" },
    tools: [{ name: "read" }],
    customTools: [{ name: "project_status" }],
    model: { id: "gpt-4.1", provider: "openai" },
    thinkingLevel: "high"
  })
  assert.deepEqual(eventSinkEvents.map((event) => event.type), ["session_created"])
  assert.deepEqual(mirrorEvents, [
    {
      sessionId: "F:\\myhanako\\sessions\\session-created.jsonl",
      type: "session_created",
      actor: "system",
      payload: {
        cwd: "F:\\workspace",
        sessionFile: "F:\\myhanako\\sessions\\session-created.jsonl"
      }
    }
  ])
})

test("SessionCoordinator recovers sessions without passing a model", async () => {
  const createAgentSessionCalls: Record<string, unknown>[] = []
  const session = createFakeSession("F:\\myhanako\\sessions\\session-restored.jsonl")
  const coordinator = new SessionCoordinator({
    createAgentSession: async (options) => {
      createAgentSessionCalls.push(options)
      return { session }
    },
    sessionManagers: {
      create() {
        throw new Error("create should not be called for recovery")
      },
      open(sessionFile) {
        assert.equal(sessionFile, "F:\\myhanako\\sessions\\session-restored.jsonl")
        return {
          getSessionFile: () => sessionFile
        }
      }
    },
    runtime: {
      authStorage: {},
      modelRegistry: {},
      resourceLoader: {}
    }
  })

  await coordinator.recoverSession({
    cwd: "F:\\workspace",
    sessionFile: "F:\\myhanako\\sessions\\session-restored.jsonl",
    model: { id: "must-not-pass", provider: "openai" }
  })

  assert.equal("model" in createAgentSessionCalls[0], false)
})

test("SessionCoordinator resolves runtime from an async provider before creating a session", async () => {
  const session = createFakeSession("F:\\myhanako\\sessions\\session-runtime.jsonl")
  const sessionManager = {
    getSessionFile: () => "F:\\myhanako\\sessions\\session-runtime.jsonl"
  }
  const authStorage = { kind: "auth" }
  const modelRegistry = { kind: "models" }
  const resourceLoader = { kind: "resources" }
  const createAgentSessionCalls: Record<string, unknown>[] = []
  let runtimeResolveCount = 0
  const coordinator = new SessionCoordinator({
    createAgentSession: async (options) => {
      createAgentSessionCalls.push(options)
      return { session }
    },
    sessionManagers: {
      create() {
        return sessionManager
      }
    },
    runtime: async () => {
      runtimeResolveCount += 1
      return {
        authStorage,
        modelRegistry,
        resourceLoader,
        tools: ["read", "workspace_read"],
        customTools: [{ name: "workspace_read" }]
      }
    }
  })

  await coordinator.createSession({
    cwd: "F:\\workspace",
    sessionDir: "F:\\myhanako\\sessions",
    model: { id: "gpt-4.1", provider: "openai" }
  })

  assert.equal(runtimeResolveCount, 1)
  assert.equal(createAgentSessionCalls[0].sessionManager, sessionManager)
  assert.equal(createAgentSessionCalls[0].authStorage, authStorage)
  assert.equal(createAgentSessionCalls[0].modelRegistry, modelRegistry)
  assert.equal(createAgentSessionCalls[0].resourceLoader, resourceLoader)
  assert.deepEqual(createAgentSessionCalls[0].tools, ["read", "workspace_read"])
  assert.deepEqual(createAgentSessionCalls[0].customTools, [
    { name: "workspace_read" }
  ])
})

test("SessionCoordinator forwards stream events and cleans up subscriptions on dispose", async () => {
  const session = createFakeSession("F:\\myhanako\\sessions\\session-stream.jsonl")
  const eventSinkEvents: unknown[] = []
  const mirrorEvents: unknown[] = []
  const coordinator = new SessionCoordinator({
    createAgentSession: async () => ({ session }),
    sessionManagers: {
      create() {
        return {
          getSessionFile: () => "F:\\myhanako\\sessions\\session-stream.jsonl"
        }
      }
    },
    runtime: {
      authStorage: {},
      modelRegistry: {},
      resourceLoader: {}
    },
    eventSink: (event) => eventSinkEvents.push(event),
    eventLog: {
      append: async (event) => {
        mirrorEvents.push(event)
      }
    }
  })

  await coordinator.createSession({
    cwd: "F:\\workspace",
    sessionDir: "F:\\myhanako\\sessions",
    model: { id: "gpt-4.1", provider: "openai" }
  })

  session.emit({ type: "message_update", delta: "hi" })
  assert.equal(eventSinkEvents.at(-1).type, "message_update")

  await coordinator.disposeCurrentSession("test cleanup")

  session.emit({ type: "message_update", delta: "after dispose" })
  assert.equal(eventSinkEvents.filter((event) => event.type === "message_update").length, 1)
  assert.equal(session.disposed, true)
  assert.equal(mirrorEvents.at(-1).type, "session_disposed")
})

test("SessionCoordinator replaces active sessions without leaking previous subscriptions", async () => {
  const firstSession = createFakeSession("F:\\myhanako\\sessions\\session-first.jsonl")
  const secondSession = createFakeSession("F:\\myhanako\\sessions\\session-second.jsonl")
  const eventSinkEvents: unknown[] = []
  const createAgentSessionCalls: Record<string, unknown>[] = []
  const coordinator = new SessionCoordinator({
    createAgentSession: async (options) => {
      createAgentSessionCalls.push(options)
      return { session: createAgentSessionCalls.length === 1 ? firstSession : secondSession }
    },
    sessionManagers: {
      create() {
        const sessionFile = createAgentSessionCalls.length === 0
          ? "F:\\myhanako\\sessions\\session-first.jsonl"
          : "F:\\myhanako\\sessions\\session-second.jsonl"
        return {
          getSessionFile: () => sessionFile
        }
      }
    },
    runtime: {
      authStorage: {},
      modelRegistry: {},
      resourceLoader: {}
    },
    eventSink: (event) => eventSinkEvents.push(event)
  })

  await coordinator.createSession({
    cwd: "F:\\workspace",
    sessionDir: "F:\\myhanako\\sessions",
    model: { id: "gpt-4.1", provider: "openai" }
  })
  await coordinator.createSession({
    cwd: "F:\\workspace",
    sessionDir: "F:\\myhanako\\sessions",
    model: { id: "gpt-4.1", provider: "openai" }
  })

  assert.equal(firstSession.disposed, true)
  firstSession.emit({ type: "message_update", delta: "stale" })
  secondSession.emit({ type: "message_update", delta: "fresh" })

  assert.equal(
    eventSinkEvents.filter((event) => event.type === "message_update").length,
    1
  )
  assert.equal(eventSinkEvents.at(-1).delta, "fresh")
})

test("SessionCoordinator sends user messages through the Pi AgentSession API", async () => {
  const session = createFakeSession("F:\\myhanako\\sessions\\session-send.jsonl")
  session.isStreaming = true
  const eventLogEvents: unknown[] = []
  const coordinator = new SessionCoordinator({
    createAgentSession: async () => ({ session }),
    sessionManagers: {
      create() {
        return {
          getSessionFile: () => "F:\\myhanako\\sessions\\session-send.jsonl"
        }
      }
    },
    runtime: {
      authStorage: {},
      modelRegistry: {},
      resourceLoader: {}
    },
    eventLog: {
      append: async (event) => {
        eventLogEvents.push(event)
      }
    }
  })

  await coordinator.createSession({
    cwd: "F:\\workspace",
    sessionDir: "F:\\myhanako\\sessions",
    model: { id: "gpt-4.1", provider: "openai" }
  })
  const result = await coordinator.sendMessage({
    sessionId: "F:\\myhanako\\sessions\\session-send.jsonl",
    messageId: "user_send_1",
    message: "continue"
  })

  assert.deepEqual(result, { ok: true, mode: "followUp" })
  assert.deepEqual(session.sentMessages, [
    {
      message: "continue",
      options: { deliverAs: "followUp" }
    }
  ])
  assert.equal(eventLogEvents.at(-1).type, "user_message_created")
})

function createFakeSession(sessionFile: string) {
  const listeners = new Set<(event: unknown) => void>()
  return {
    disposed: false,
    isStreaming: false,
    sentMessages: [] as { message: string; options: Record<string, unknown> | undefined }[],
    sessionManager: {
      getSessionFile: () => sessionFile
    },
    subscribe(listener: (event: unknown) => void) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    emit(event: unknown) {
      for (const listener of listeners) {
        listener(event)
      }
    },
    sendUserMessage(message: string, options?: Record<string, unknown>) {
      this.sentMessages.push({ message, options })
    },
    async dispose() {
      this.disposed = true
    }
  }
}
