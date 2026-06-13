import assert from "node:assert/strict"
import test from "node:test"
import {
  HanaAdapter,
  type HanaEventBus
} from "../src/hana/adapter.ts"

test("HanaAdapter reports plugin diagnostics unavailable when capability is missing", async () => {
  const adapter = new HanaAdapter({
    eventBus: createEventBus({
      capabilities: ["plugin.dev.reload"]
    })
  })

  assert.deepEqual(await adapter.readPluginDiagnostics("myhanako"), {
    status: "unavailable",
    reason: "Missing Hana capability: plugin.dev.diagnostics",
    capability: "plugin.dev.diagnostics"
  })
})

test("HanaAdapter reads plugin diagnostics when capability is available", async () => {
  const adapter = new HanaAdapter({
    eventBus: createEventBus({
      capabilities: ["plugin.dev.diagnostics"],
      diagnosticsResult: {
        ok: true,
        pluginId: "myhanako"
      }
    })
  })

  assert.deepEqual(await adapter.readPluginDiagnostics("myhanako"), {
    status: "available",
    capability: "plugin.dev.diagnostics",
    diagnostics: {
      ok: true,
      pluginId: "myhanako"
    }
  })
})

test("HanaAdapter reads plugin diagnostics from Hana capability descriptors", async () => {
  const adapter = new HanaAdapter({
    eventBus: createEventBus({
      capabilities: [
        {
          type: "plugin.dev.diagnostics",
          available: true,
          stability: "experimental"
        }
      ],
      diagnosticsResult: {
        ok: true,
        pluginId: "myhanako"
      }
    })
  })

  assert.deepEqual(await adapter.readPluginDiagnostics("myhanako"), {
    status: "available",
    capability: "plugin.dev.diagnostics",
    stability: "experimental",
    diagnostics: {
      ok: true,
      pluginId: "myhanako"
    }
  })
})

test("HanaAdapter reports diagnostics unavailable when descriptor is disabled", async () => {
  const adapter = new HanaAdapter({
    eventBus: createEventBus({
      capabilities: [
        {
          type: "plugin.dev.diagnostics",
          available: false,
          stability: "experimental"
        }
      ]
    })
  })

  assert.deepEqual(await adapter.readPluginDiagnostics("myhanako"), {
    status: "unavailable",
    reason: "Hana capability unavailable: plugin.dev.diagnostics",
    capability: "plugin.dev.diagnostics",
    stability: "experimental"
  })
})

test("HanaAdapter prefers getCapability descriptors when available", async () => {
  const adapter = new HanaAdapter({
    eventBus: {
      listCapabilities() {
        throw new Error("listCapabilities should not be called")
      },
      getCapability(capability) {
        assert.equal(capability, "plugin.dev.diagnostics")
        return {
          type: "plugin.dev.diagnostics",
          available: true,
          stability: "experimental"
        }
      },
      async request(capability, payload) {
        assert.equal(capability, "plugin.dev.diagnostics")
        assert.deepEqual(payload, {
          pluginId: "myhanako"
        })
        return {
          ok: true
        }
      }
    }
  })

  assert.deepEqual(await adapter.readPluginDiagnostics("myhanako"), {
    status: "available",
    capability: "plugin.dev.diagnostics",
    stability: "experimental",
    diagnostics: {
      ok: true
    }
  })
})

test("HanaAdapter returns degraded diagnostics errors instead of throwing", async () => {
  const adapter = new HanaAdapter({
    eventBus: createEventBus({
      capabilities: ["plugin.dev.diagnostics"],
      diagnosticsError: new Error("Hana route failed")
    })
  })

  assert.deepEqual(await adapter.readPluginDiagnostics("myhanako"), {
    status: "degraded",
    reason: "Hana route failed",
    capability: "plugin.dev.diagnostics"
  })
})

test("HanaAdapter returns degraded discovery errors instead of throwing", async () => {
  const adapter = new HanaAdapter({
    eventBus: createEventBus({
      capabilitiesError: new Error("Capability route failed")
    })
  })

  assert.deepEqual(await adapter.readPluginDiagnostics("myhanako"), {
    status: "degraded",
    reason: "Capability route failed",
    capability: "plugin.dev.diagnostics"
  })
})

test("HanaAdapter calls dev plugin install reload invoke and surface capabilities", async () => {
  const requests: { readonly capability: string; readonly payload: unknown }[] = []
  const adapter = new HanaAdapter({
    eventBus: createEventBus({
      capabilities: [
        "plugin.dev.install",
        "plugin.dev.reload",
        "plugin.dev.invokeTool",
        "plugin.dev.listSurfaces"
      ],
      onRequest(capability, payload) {
        requests.push({ capability, payload })
        return capability === "plugin.dev.listSurfaces"
          ? [
              {
                kind: "page",
                pluginId: "target-plugin",
                title: "Status",
                route: "/status",
                routeUrl: "/api/plugins/target-plugin/status",
                hostCapabilities: []
              }
            ]
          : {
              ok: true
            }
      }
    })
  })

  assert.equal((await adapter.installDevPlugin({
    sourcePath: "C:\\plugin",
    pluginId: "target-plugin",
    allowFullAccess: true
  })).status, "completed")
  assert.equal((await adapter.reloadDevPlugin({
    pluginId: "target-plugin",
    devRunId: "dev_1"
  })).status, "completed")
  assert.equal((await adapter.invokePluginTool({
    pluginId: "target-plugin",
    toolName: "echo",
    input: {
      text: "hello"
    }
  })).status, "completed")
  const surfaces = await adapter.listPluginSurfaces({
    pluginId: "target-plugin"
  })

  assert.equal(surfaces.status, "completed")
  assert.deepEqual(requests, [
    {
      capability: "plugin.dev.install",
      payload: {
        sourcePath: "C:\\plugin",
        pluginId: "target-plugin",
        allowFullAccess: true
      }
    },
    {
      capability: "plugin.dev.reload",
      payload: {
        pluginId: "target-plugin",
        devRunId: "dev_1"
      }
    },
    {
      capability: "plugin.dev.invokeTool",
      payload: {
        pluginId: "target-plugin",
        toolName: "echo",
        input: {
          text: "hello"
        }
      }
    },
    {
      capability: "plugin.dev.listSurfaces",
      payload: {
        pluginId: "target-plugin"
      }
    }
  ])
  if (surfaces.status !== "completed") {
    throw new Error("Expected surfaces")
  }
  assert.deepEqual(surfaces.surfaces, [
    {
      kind: "page",
      pluginId: "target-plugin",
      title: "Status",
      route: "/status",
      routeUrl: "/api/plugins/target-plugin/status",
      hostCapabilities: []
    }
  ])
})

test("HanaAdapter creates plugin-private sessions and sends explicit session messages", async () => {
  const requests: { readonly capability: string; readonly payload: unknown }[] = []
  const adapter = new HanaAdapter({
    eventBus: createEventBus({
      capabilities: ["session:create", "session:send"],
      onRequest(capability, payload) {
        requests.push({ capability, payload })
        return capability === "session:create"
          ? {
              sessionPath: "sessions/lab.jsonl"
            }
          : {
              accepted: true
            }
      }
    })
  })

  const created = await adapter.createPluginPrivateSession({
    ownerPluginId: "myhanako",
    title: "Lab",
    cwd: "C:\\project"
  })
  const sent = await adapter.sendPluginPrivateSessionMessage({
    sessionPath: "sessions/lab.jsonl",
    text: "hello",
    context: {
      beforeUser: "lab context"
    }
  })

  assert.equal(created.status, "completed")
  assert.equal(sent.status, "completed")
  assert.deepEqual(requests, [
    {
      capability: "session:create",
      payload: {
        ownerPluginId: "myhanako",
        kind: "myhanako.lab",
        visibility: "plugin_private",
        title: "Lab",
        cwd: "C:\\project"
      }
    },
    {
      capability: "session:send",
      payload: {
        sessionPath: "sessions/lab.jsonl",
        text: "hello",
        context: {
          beforeUser: "lab context"
        }
      }
    }
  ])
})

function createEventBus(options: {
  readonly capabilities?: readonly (
    | string
    | {
        readonly type: string
        readonly available?: boolean
        readonly stability?: string
      }
  )[]
  readonly capabilitiesError?: Error
  readonly diagnosticsResult?: unknown
  readonly diagnosticsError?: Error
  readonly onRequest?: (capability: string, payload: unknown) => unknown
}): HanaEventBus {
  return {
    async listCapabilities() {
      if (options.capabilitiesError) {
        throw options.capabilitiesError
      }
      return [...(options.capabilities ?? [])]
    },
    async request(capability, payload) {
      if (options.onRequest) {
        return options.onRequest(capability, payload)
      }
      assert.equal(capability, "plugin.dev.diagnostics")
      assert.deepEqual(payload, {
        pluginId: "myhanako"
      })
      if (options.diagnosticsError) {
        throw options.diagnosticsError
      }
      return options.diagnosticsResult
    }
  }
}
