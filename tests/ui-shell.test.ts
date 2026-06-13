import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import {
  createMyhanakoBootstrap,
  renderMyhanakoAppShell
} from "../src/ui/app-shell.ts"
import registerMyhanakoStatusRoute from "../src/hana/plugin/routes/status.ts"

test("renderMyhanakoAppShell includes MVP navigation, panels, and empty states", () => {
  const html = renderMyhanakoAppShell({
    mode: "standalone",
    bootstrap: createMyhanakoBootstrap({
      pluginId: "myhanako",
      apiBase: "/api/plugins/myhanako",
      version: "0.1.0"
    })
  })

  assert.match(html, /data-myhanako-app/)
  assert.match(html, /工作流复盘/)
  assert.match(html, /插件实验室/)
  assert.match(html, /证据导出/)
  assert.match(html, /尚未选择工作流证据/)
  assert.match(html, /实验模式/)
  assert.match(html, /导出脱敏包/)
  assert.match(html, /myhanako-app\.css/)
  assert.match(html, /myhanako-app\.js/)
})

test("standalone asset is a browser-openable HTML entry", async () => {
  const html = await readFile("assets/standalone.html", "utf8")

  assert.match(html, /<!doctype html>/i)
  assert.match(html, /data-myhanako-app/)
  assert.match(html, /myhanako-app\.css/)
  assert.match(html, /myhanako-app\.js/)
  assert.match(html, /工作流复盘/)
})

test("browser assets contain the minimum interactive controllers", async () => {
  const script = await readFile("assets/myhanako-app.js", "utf8")
  const css = await readFile("assets/myhanako-app.css", "utf8")

  assert.match(script, /loadWorkflowReview/)
  assert.match(script, /runLabAction/)
  assert.match(script, /exportEvidenceBundle/)
  assert.match(script, /createWorkflowDraft/)
  assert.match(css, /hana-plugin-theme/)
  assert.match(css, /#537D96/)
  assert.match(css, /\.state-empty/)
  assert.match(css, /\.state-error/)
})

test("Hana status route serves embedded UI without pluginId and keeps JSON diagnostics with pluginId", async () => {
  const routes: {
    readonly path: string
    readonly handler: (context: FakeRouteContext) => Promise<unknown>
  }[] = []

  registerMyhanakoStatusRoute(
    {
      get(path, handler) {
        routes.push({ path, handler })
      }
    },
    {
      pluginId: "myhanako"
    }
  )

  const htmlResponse = await routes[0].handler(createFakeRouteContext())
  const jsonResponse = await routes[0].handler(createFakeRouteContext("myhanako"))

  assertHtmlResponse(htmlResponse)
  assert.equal(htmlResponse.status, 200)
  assert.match(htmlResponse.html, /data-myhanako-app/)
  assert.match(htmlResponse.html, /embedded/)

  assert.deepEqual(jsonResponse, {
    status: 200,
    json: {
      hostPluginId: "myhanako",
      targetPluginId: "myhanako",
      pluginId: "myhanako",
      status: "degraded",
      reason: "sidecar unavailable"
    }
  })
})

type FakeRouteContext = {
  readonly req: {
    query(name: string): string | undefined
  }
  json(value: unknown, status?: number): unknown
  html(value: string, status?: number): unknown
}

function createFakeRouteContext(targetPluginId?: string): FakeRouteContext {
  return {
    req: {
      query(name) {
        return name === "pluginId" ? targetPluginId : undefined
      }
    },
    json(value, status = 200) {
      return {
        status,
        json: value
      }
    },
    html(value, status = 200) {
      return {
        status,
        html: value
      }
    }
  }
}

function assertHtmlResponse(
  value: unknown
): asserts value is { readonly status: number; readonly html: string } {
  assert.equal(
    value !== null &&
      typeof value === "object" &&
      "status" in value &&
      "html" in value &&
      typeof value.html === "string",
    true
  )
}
