import assert from "node:assert/strict"
import { mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"
import { recordTerminalRuntimeEvent } from "../../core/src/enhancement-projection.ts"
import { Engine } from "../../core/src/engine.ts"
import {
  MemoryCompiler
} from "../../core/src/memory-compiler.ts"
import {
  InMemoryMemoryStore,
  MemoryService
} from "../../core/src/memory-service.ts"
import { PromptAssembler } from "../../core/src/prompt-assembler.ts"
import {
  InMemorySessionEventStore,
  SessionEventLog
} from "../../core/src/session-event-log.ts"
import { SessionCoordinator } from "../../core/src/session-coordinator.ts"
import { SessionInspector } from "../../core/src/session-inspector.ts"
import {
  InMemoryPatchStore,
  PatchService,
  WorkspaceService
} from "../../core/src/workspace-service.ts"
import { LocalMyHanakoServer } from "../src/local-server.ts"

test("LocalMyHanakoServer exposes create/send/interrupt/events/inspector and websocket projection", async () => {
  const eventLog = createEventLog()
  const sessionId = "F:\\myhanako\\sessions\\session-server.jsonl"
  const workspaceRoot = await mkdtemp(join(tmpdir(), "myhanako-p0-m7-"))
  await writeFile(join(workspaceRoot, "README.md"), "before\n", "utf8")
  const session = createFakeSession(sessionId)
  let server!: LocalMyHanakoServer
  const coordinator = new SessionCoordinator({
    createAgentSession: async () => ({ session }),
    sessionManagers: {
      create() {
        return {
          getSessionFile: () => sessionId
        }
      }
    },
    runtime: {
      authStorage: {},
      modelRegistry: {},
      resourceLoader: {}
    },
    eventLog,
    eventSink: (event) => server.publish(event)
  })
  const engine = new Engine({
    sessionCoordinator: coordinator,
    modelManager: {
      availableModels: [{ provider: "openai", id: "gpt-4.1" }]
    }
  })
  const inspector = new SessionInspector({
    eventLog,
    runtimeSnapshot: () => ({
      tools: ["read"]
    })
  })
  server = new LocalMyHanakoServer({
    engine,
    eventLog,
    inspector
  })
  const address = await server.listen()

  try {
    const ws = new WebSocket(`${address.wsUrl}/events`)
    await waitForWebSocketOpen(ws)
    const nextWsMessage = waitForWebSocketMessage(ws)

    const createResponse = await postJson(`${address.url}/sessions/create`, {
      cwd: "F:\\workspace",
      sessionDir: "F:\\myhanako\\sessions",
      model: { provider: "openai", id: "gpt-4.1" }
    })
    assert.deepEqual(createResponse, {
      sessionId
    })
    const createdWsMessage = await nextWsMessage
    assert.equal(createdWsMessage.type, "session_created")
    assert.equal(createdWsMessage.sessionPath, sessionId)
    assert.equal(createdWsMessage.seq, 1)
    assert.match(createdWsMessage.streamId, /^s_/)

    const sendResponse = await postJson(`${address.url}/sessions/send`, {
      sessionId,
      messageId: "user_1",
      message: "hello",
      triggerTurn: true
    })
    assert.deepEqual(sendResponse, {
      ok: true,
      mode: "triggerTurn"
    })
    assert.deepEqual(session.sentMessages, [
      {
        message: "hello",
        options: {}
      }
    ])

    session.emit({
      type: "message_update",
      assistantMessageEvent: {
        type: "text_delta",
        delta: "hi"
      }
    })
    const resumeResponse = await getJson(`${address.url}/events/resume?sessionId=${encodeURIComponent(sessionId)}&sinceSeq=1`)
    assert.equal(resumeResponse.type, "stream_resume")
    assert.equal(resumeResponse.sessionPath, sessionId)
    assert.equal(resumeResponse.events.length >= 1, true)
    session.emit({ type: "turn_end" })
    await waitForEventCount(eventLog, sessionId, 5)

    await recordFullSystemProjectionEvents({
      eventLog,
      sessionId,
      workspaceRoot
    })
    session.emit({
      type: "tool_execution_start",
      toolCallId: "tool_call_1",
      toolName: "workspace_read",
      args: {
        path: "README.md"
      }
    })
    session.emit({
      type: "tool_execution_end",
      toolCallId: "tool_call_1",
      toolName: "workspace_read",
      result: {
        details: {
          ok: true,
          path: "README.md"
        }
      }
    })
    await waitForEventType(eventLog, sessionId, "tool_call_completed")

    const eventResponse = await getJson(`${address.url}/events?sessionId=${encodeURIComponent(sessionId)}`)
    assert.deepEqual(
      eventResponse.events.slice(0, 5).map((event: { type: string }) => event.type),
      [
        "session_created",
        "user_message_created",
        "assistant_stream_started",
        "assistant_delta_received",
        "assistant_message_completed"
      ]
    )
    assert.equal(eventResponse.events.some((event: { type: string }) => event.type === "tool_call_completed"), true)
    assert.equal(eventResponse.events.some((event: { type: string }) => event.type === "file_write_committed"), true)
    assert.equal(eventResponse.events.some((event: { type: string }) => event.type === "terminal_process_exited"), true)
    assert.equal(eventResponse.events.some((event: { type: string }) => event.type === "memory_injected"), true)

    const interruptResponse = await postJson(`${address.url}/sessions/interrupt`, {
      sessionId,
      requestId: "req_interrupt",
      reason: "test"
    })
    assert.deepEqual(interruptResponse, { ok: true })
    assert.equal(session.aborted, true)

    const inspectorResponse = await getJson(`${address.url}/inspector?sessionId=${encodeURIComponent(sessionId)}`)
    assert.deepEqual(
      inspectorResponse.transcript.map((message: { role: string; content: string }) => [message.role, message.content]),
      [
        ["user", "hello"],
        ["assistant", "hi"]
      ]
    )
    assert.deepEqual(inspectorResponse.runtime, { tools: ["read"] })
    assert.deepEqual(inspectorResponse.promptLayers[0].layers.map((layer: { id: string }) => layer.id), [
      "system:base",
      "memory:pinned"
    ])
    assert.equal(inspectorResponse.tools[0].tools[0].name, "workspace_read")
    assert.equal(inspectorResponse.modelRequests[0].requestId, "req_prompt")
    assert.equal(inspectorResponse.modelRequests[0].model, "openai/gpt-4.1")
    assert.equal(inspectorResponse.modelRequests[0].modelRole, "chat")
    assert.deepEqual(
      inspectorResponse.memory.map((entry: { type: string }) => entry.type),
      ["memory_item", "memory_compilation", "memory_injection"]
    )
    assert.equal(inspectorResponse.fileDiffCards[0].type, "file_diff")
    assert.equal(inspectorResponse.fileDiffCards[0].status, "committed")
    assert.equal(inspectorResponse.fileDiffCards[0].path, "README.md")
    assert.equal(inspectorResponse.terminalCards[0].type, "terminal")
    assert.equal(inspectorResponse.terminalCards[0].status, "exited")
    assert.deepEqual(
      inspectorResponse.terminalCards[0].output.map((chunk: { sequence: number; normalizedText: string }) => [chunk.sequence, chunk.normalizedText]),
      [
        [1, "running\n"],
        [2, "done\n"]
      ]
    )

    ws.close()
  } finally {
    await server.close()
  }
})

function createFakeSession(sessionFile: string) {
  const listeners = new Set<(event: unknown) => void>()
  return {
    aborted: false,
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
    abort() {
      this.aborted = true
    }
  }
}

function createEventLog(): SessionEventLog {
  return new SessionEventLog({
    store: new InMemorySessionEventStore(),
    clock: () => new Date("2026-05-31T00:00:00.000Z"),
    idFactory: (event) => `evt_${event.sequence}`
  })
}

async function recordFullSystemProjectionEvents(input: {
  readonly eventLog: SessionEventLog
  readonly sessionId: string
  readonly workspaceRoot: string
}): Promise<void> {
  const memoryService = new MemoryService({
    store: new InMemoryMemoryStore(),
    clock: () => new Date("2026-05-31T00:00:00.000Z"),
    idFactory: () => "memory_p0"
  })
  const memory = await memoryService.createItem(
    {
      type: "preference",
      content: "Keep Pi SDK as the runtime truth.",
      sourceSessionId: input.sessionId,
      sourceEventIds: ["evt_5"],
      confidence: 1,
      status: "active",
      visibility: "pinned",
      scope: {
        kind: "global"
      },
      tags: ["runtime"]
    },
    {
      sessionId: input.sessionId,
      eventLog: input.eventLog
    }
  )
  const memoryCompiler = new MemoryCompiler({
    compilationIdFactory: () => "memory_compilation_p0"
  })
  const memoryCompilation = memoryCompiler.compile({
    items: [memory],
    now: new Date("2026-05-31T00:00:00.000Z")
  })
  await memoryCompiler.recordCompilationEvent({
    eventLog: input.eventLog,
    sessionId: input.sessionId,
    compilation: memoryCompilation
  })

  const promptAssembler = new PromptAssembler({
    requestIdFactory: () => "req_prompt",
    tokenEstimator: (content) => content.length
  })
  const promptBundle = promptAssembler.assemble({
    requestId: "req_prompt",
    model: "openai/gpt-4.1",
    modelRole: "chat",
    layers: [
      {
        id: "system:base",
        source: "system",
        priority: 10,
        enabled: true,
        editable: false,
        version: "1",
        content: "Use the Pi SDK session as runtime truth."
      },
      ...memoryCompilation.layers
    ],
    injectedMemoryIds: memoryCompilation.memoryIds,
    toolDefinitions: [
      {
        id: "tool.workspace_read",
        name: "workspace_read",
        source: "core",
        description: "Read a workspace file through the controlled path policy.",
        schemaChecksum: "sha256:workspace-read",
        parameters: {
          type: "object",
          properties: {
            path: {
              type: "string"
            }
          },
          required: ["path"]
        },
        permissions: ["workspace:read"]
      }
    ]
  })
  await promptAssembler.recordPromptBundleEvents({
    log: input.eventLog,
    sessionId: input.sessionId,
    bundle: promptBundle
  })

  const patchStore = new InMemoryPatchStore()
  const workspace = new WorkspaceService({
    rootDir: input.workspaceRoot,
    patchStore,
    snapshotIdFactory: () => "snapshot_p0"
  })
  const patches = new PatchService({
    patchStore,
    patchIdFactory: () => "patch_p0"
  })
  const snapshot = await workspace.readSnapshot("README.md", {
    sessionId: input.sessionId,
    eventLog: input.eventLog
  })
  await patches.proposeReplacement(
    {
      snapshot,
      newContent: "after\n",
      summary: "Update README"
    },
    {
      sessionId: input.sessionId,
      eventLog: input.eventLog
    }
  )
  await workspace.commitPatch("patch_p0", {
    sessionId: input.sessionId,
    eventLog: input.eventLog
  })

  await recordTerminalRuntimeEvent({
    eventLog: input.eventLog,
    sessionId: input.sessionId,
    event: {
      type: "terminal_started",
      terminalId: "term_p0",
      command: "npm test",
      cwd: "F:\\workspace"
    }
  })
  await recordTerminalRuntimeEvent({
    eventLog: input.eventLog,
    sessionId: input.sessionId,
    event: {
      type: "terminal_output",
      terminalId: "term_p0",
      seq: 1,
      data: "running\r\n"
    }
  })
  await recordTerminalRuntimeEvent({
    eventLog: input.eventLog,
    sessionId: input.sessionId,
    event: {
      type: "terminal_output",
      terminalId: "term_p0",
      seq: 2,
      data: "\u001b[32mdone\r\n"
    }
  })
  await recordTerminalRuntimeEvent({
    eventLog: input.eventLog,
    sessionId: input.sessionId,
    event: {
      type: "terminal_exited",
      terminalId: "term_p0",
      exitCode: 0
    }
  })
}

async function postJson(url: string, body: unknown): Promise<any> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  })
  return response.json()
}

async function getJson(url: string): Promise<any> {
  const response = await fetch(url)
  return response.json()
}

function waitForWebSocketOpen(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    ws.addEventListener("open", () => resolve(), { once: true })
    ws.addEventListener("error", () => reject(new Error("websocket open failed")), { once: true })
  })
}

function waitForWebSocketMessage(ws: WebSocket): Promise<any> {
  return new Promise((resolve) => {
    ws.addEventListener("message", (event) => {
      resolve(JSON.parse(String(event.data)))
    }, { once: true })
  })
}

async function waitForEventCount(
  eventLog: SessionEventLog,
  sessionId: string,
  count: number
): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const events = await eventLog.listSessionEvents(sessionId)
    if (events.length >= count) {
      return
    }
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  assert.fail(`Timed out waiting for ${count} events`)
}

async function waitForEventType(
  eventLog: SessionEventLog,
  sessionId: string,
  type: string
): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const events = await eventLog.listSessionEvents(sessionId)
    if (events.some((event) => event.type === type)) {
      return
    }
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  assert.fail(`Timed out waiting for ${type}`)
}
