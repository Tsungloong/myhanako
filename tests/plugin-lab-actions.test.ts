import assert from "node:assert/strict"
import { mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"
import { EvidenceLog } from "../src/core/evidence-log.ts"
import {
  createLogBackedPluginLab,
  type PluginLabAdapter
} from "../src/hana/plugin/index.ts"

test("plugin lab rejects mutating dev actions unless lab mode is explicit", async () => {
  const log = await createTempEvidenceLog()
  let requested = false
  const lab = createLogBackedPluginLab({
    adapter: {
      ...createActionAdapter(),
      async reloadDevPlugin() {
        requested = true
        return {
          status: "completed",
          capability: "plugin.dev.reload",
          result: {
            ok: true
          }
        }
      }
    },
    evidenceLog: log,
    metadata: createMetadata()
  })

  const result = await lab.runAction({
    action: "plugin.reload_dev",
    input: {
      pluginId: "target-plugin"
    }
  })
  const records = await log.readAll()

  assert.equal(requested, false)
  assert.equal(result.status, "denied")
  assert.equal(result.reason, "Lab mode is required for mutating lab actions")
  assert.equal(records.length, 1)
  assert.equal(records[0].eventType, "lab.action.denied")
  assert.deepEqual(records[0].payload, {
    action: "plugin.reload_dev",
    status: "denied",
    reason: "Lab mode is required for mutating lab actions",
    input: {
      pluginId: "target-plugin"
    }
  })
})

test("plugin lab records install reload invoke and surfaces action history", async () => {
  const log = await createTempEvidenceLog()
  const calls: string[] = []
  const lab = createLogBackedPluginLab({
    adapter: {
      ...createActionAdapter(),
      async installDevPlugin(input) {
        calls.push(`install:${input.sourcePath}`)
        return {
          status: "completed",
          capability: "plugin.dev.install",
          result: {
            ok: true,
            pluginId: input.pluginId ?? "target-plugin",
            devRunId: "dev_1"
          }
        }
      },
      async reloadDevPlugin(input) {
        calls.push(`reload:${input.pluginId}`)
        return {
          status: "completed",
          capability: "plugin.dev.reload",
          result: {
            ok: true,
            pluginId: input.pluginId,
            devRunId: "dev_2"
          }
        }
      },
      async invokePluginTool(input) {
        calls.push(`invoke:${input.pluginId}:${input.toolName}`)
        return {
          status: "completed",
          capability: "plugin.dev.invokeTool",
          result: {
            pluginId: input.pluginId,
            toolName: input.toolName,
            result: {
              ok: true
            }
          }
        }
      },
      async listPluginSurfaces(input) {
        calls.push(`surfaces:${input.pluginId}`)
        return {
          status: "completed",
          capability: "plugin.dev.listSurfaces",
          surfaces: [
            {
              kind: "page",
              pluginId: input.pluginId ?? "target-plugin",
              title: "Status",
              route: "/status",
              routeUrl: "/api/plugins/target-plugin/status",
              hostCapabilities: []
            }
          ]
        }
      }
    },
    evidenceLog: log,
    metadata: createMetadata()
  })

  const install = await lab.runAction({
    action: "plugin.install_dev",
    labMode: true,
    input: {
      sourcePath: "C:\\Users\\Alice\\.hanako\\plugin-dev-sources\\target",
      pluginId: "target-plugin",
      allowFullAccess: true
    }
  })
  const reload = await lab.runAction({
    action: "plugin.reload_dev",
    labMode: true,
    input: {
      pluginId: "target-plugin",
      devRunId: "dev_1"
    }
  })
  const invoke = await lab.runAction({
    action: "plugin.invoke_tool",
    labMode: true,
    input: {
      pluginId: "target-plugin",
      toolName: "echo",
      input: {
        text: "hello"
      }
    }
  })
  const surfaces = await lab.runAction({
    action: "plugin.list_surfaces",
    input: {
      pluginId: "target-plugin"
    }
  })
  const records = await log.readAll()

  assert.deepEqual(calls, [
    "install:C:\\Users\\Alice\\.hanako\\plugin-dev-sources\\target",
    "reload:target-plugin",
    "invoke:target-plugin:echo",
    "surfaces:target-plugin"
  ])
  assert.equal(install.status, "completed")
  assert.equal(reload.status, "completed")
  assert.equal(invoke.status, "completed")
  assert.equal(surfaces.status, "completed")
  assert.deepEqual(
    records.map((record) => {
      if (record.payload === null || typeof record.payload !== "object" || Array.isArray(record.payload)) {
        throw new Error("Expected lab action payload object")
      }
      const payload = record.payload as Record<string, unknown>
      return {
        eventId: record.eventId,
        eventType: record.eventType,
        action: payload.action,
        sequence: record.sequence,
        labRunId: record.refs.labRunId
      }
    }),
    [
      {
        eventId: "evt_lab_action_lab_1",
        eventType: "lab.action.completed",
        action: "plugin.install_dev",
        sequence: 1,
        labRunId: "lab_lab_1"
      },
      {
        eventId: "evt_lab_action_lab_2",
        eventType: "lab.action.completed",
        action: "plugin.reload_dev",
        sequence: 2,
        labRunId: "lab_lab_2"
      },
      {
        eventId: "evt_lab_action_lab_3",
        eventType: "lab.action.completed",
        action: "plugin.invoke_tool",
        sequence: 3,
        labRunId: "lab_lab_3"
      },
      {
        eventId: "evt_lab_action_lab_4",
        eventType: "lab.action.completed",
        action: "plugin.list_surfaces",
        sequence: 4,
        labRunId: "lab_lab_4"
      }
    ]
  )
  assert.deepEqual(records[0].redaction.fields, [
    "payload.input.sourcePath"
  ])
})

test("plugin lab creates plugin-private sessions and records lab messages", async () => {
  const log = await createTempEvidenceLog()
  const sessionPayloads: unknown[] = []
  const lab = createLogBackedPluginLab({
    adapter: {
      ...createActionAdapter(),
      async createPluginPrivateSession(input) {
        sessionPayloads.push(input)
        return {
          status: "completed",
          capability: "session:create",
          result: {
            sessionPath: "sessions/lab.jsonl",
            visibility: "plugin_private",
            ownerPluginId: input.ownerPluginId
          }
        }
      },
      async sendPluginPrivateSessionMessage(input) {
        sessionPayloads.push(input)
        return {
          status: "completed",
          capability: "session:send",
          result: {
            sessionPath: input.sessionPath,
            accepted: true
          }
        }
      }
    },
    evidenceLog: log,
    metadata: createMetadata({
      hostPluginId: "myhanako"
    })
  })

  const created = await lab.runAction({
    action: "session.create_plugin_private",
    labMode: true,
    input: {
      title: "Lab",
      cwd: "C:\\Users\\Alice\\project"
    }
  })
  const sent = await lab.runAction({
    action: "session.send_lab_message",
    labMode: true,
    input: {
      sessionPath: "sessions/lab.jsonl",
      text: "smoke",
      context: {
        beforeUser: "lab context"
      }
    }
  })
  const records = await log.readAll()

  assert.equal(created.status, "completed")
  assert.equal(sent.status, "completed")
  assert.deepEqual(sessionPayloads, [
    {
      ownerPluginId: "myhanako",
      kind: "myhanako.lab",
      visibility: "plugin_private",
      title: "Lab",
      cwd: "C:\\Users\\Alice\\project"
    },
    {
      sessionPath: "sessions/lab.jsonl",
      text: "smoke",
      context: {
        beforeUser: "lab context"
      }
    }
  ])
  assert.deepEqual(
    records.map((record) => record.eventType),
    ["lab.action.completed", "lab.action.completed"]
  )
  assert.deepEqual(records.map((record) => record.source.capability), [
    "session:create",
    "session:send"
  ])
})

async function createTempEvidenceLog(): Promise<EvidenceLog> {
  const root = await mkdtemp(join(tmpdir(), "myhanako-lab-actions-"))
  return new EvidenceLog(join(root, "evidence.jsonl"))
}

function createMetadata(overrides: Partial<{
  hostPluginId: string
}> = {}) {
  return {
    hanaVersion: "0.310.1",
    adapterVersion: "0.1.0",
    probeVersion: "0.1.0",
    timestamp: () => "2026-06-13T00:00:00.000Z",
    idSeed: "lab",
    ...overrides
  }
}

function createActionAdapter(): PluginLabAdapter {
  return {
    async readPluginDiagnostics() {
      return {
        status: "unavailable",
        reason: "unused",
        capability: "plugin.dev.diagnostics"
      }
    },
    async installDevPlugin() {
      throw new Error("installDevPlugin should not be called")
    },
    async reloadDevPlugin() {
      throw new Error("reloadDevPlugin should not be called")
    },
    async invokePluginTool() {
      throw new Error("invokePluginTool should not be called")
    },
    async listPluginSurfaces() {
      throw new Error("listPluginSurfaces should not be called")
    },
    async createPluginPrivateSession() {
      throw new Error("createPluginPrivateSession should not be called")
    },
    async sendPluginPrivateSessionMessage() {
      throw new Error("sendPluginPrivateSessionMessage should not be called")
    }
  }
}
