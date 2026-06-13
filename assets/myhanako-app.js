const bootstrap = readBootstrap()
const state = {
  activePanel: "workflow"
}

bindTabs()
bindActions()
setStatus(`就绪 · ${bootstrap.pluginId} ${bootstrap.version}`)

function readBootstrap() {
  const node = document.getElementById("myhanako-bootstrap")
  if (!node?.textContent) {
    return {
      pluginId: "myhanako",
      apiBase: "/api/plugins/myhanako",
      sidecarBase: "http://127.0.0.1:14501",
      version: "0.1.0"
    }
  }
  return JSON.parse(node.textContent)
}

function bindTabs() {
  for (const button of document.querySelectorAll("[data-tab-target]")) {
    button.addEventListener("click", () => {
      state.activePanel = button.dataset.tabTarget
      for (const tab of document.querySelectorAll("[data-tab-target]")) {
        tab.classList.toggle("is-active", tab === button)
      }
      for (const panel of document.querySelectorAll("[data-panel]")) {
        panel.classList.toggle("is-active", panel.dataset.panel === state.activePanel)
      }
    })
  }
}

function bindActions() {
  bind("load-review", loadWorkflowReview)
  bind("plugin-status", loadPluginStatus)
  bind("list-surfaces", () => runLabAction("plugin.list_surfaces", {
    pluginId: valueOf("plugin-id")
  }))
  bind("reload-plugin", () => runLabAction("plugin.reload_dev", {
    pluginId: valueOf("plugin-id")
  }))
  bind("invoke-tool", () => runLabAction("plugin.invoke_tool", {
    pluginId: valueOf("plugin-id"),
    toolName: valueOf("tool-name"),
    input: {}
  }))
  bind("create-lab-session", () => runLabAction("session.create_plugin_private", {
    ownerPluginId: valueOf("plugin-id"),
    title: "myhanako 插件实验室"
  }))
  bind("export-bundle", exportEvidenceBundle)
  bind("create-draft", createWorkflowDraft)
}

function bind(action, handler) {
  const button = document.querySelector(`[data-action="${action}"]`)
  button?.addEventListener("click", async () => {
    await withButton(button, handler)
  })
}

async function loadWorkflowReview() {
  const sessionId = valueOf("session-id")
  const response = await fetchJson(`${bootstrap.sidecarBase}/v1/sessions/${encodeURIComponent(sessionId)}/workflow-review`)
  renderWorkflowReview(response)
  writeOutput("workflow", response)
}

async function loadPluginStatus() {
  const pluginId = valueOf("plugin-id")
  const path = document.body.dataset.mode === "embedded"
    ? `${bootstrap.apiBase}/status?pluginId=${encodeURIComponent(pluginId)}`
    : `${bootstrap.sidecarBase}/v1/plugins/${encodeURIComponent(pluginId)}/lab`
  const response = await fetchJson(path)
  writeOutput("lab", response)
}

async function runLabAction(action, input) {
  const endpoint = document.body.dataset.mode === "embedded"
    ? `${bootstrap.apiBase}/lab/actions`
    : `${bootstrap.sidecarBase}/v1/lab/actions`
  const response = await fetchJson(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      action,
      labMode: document.getElementById("lab-mode")?.checked === true,
      input
    })
  })
  writeOutput("lab", response)
}

async function exportEvidenceBundle() {
  const response = await fetchJson(`${bootstrap.sidecarBase}/v1/evidence-bundles`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      sessionId: valueOf("session-id"),
      pluginId: valueOf("plugin-id")
    })
  })
  writeOutput("export", response)
}

async function createWorkflowDraft() {
  const response = await fetchJson(`${bootstrap.sidecarBase}/v1/workflow-adjustments/draft`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      sessionId: valueOf("session-id"),
      feedback: valueOf("workflow-feedback"),
      scope: "session"
    })
  })
  writeOutput("export", response)
}

async function fetchJson(url, options) {
  setStatus("请求中")
  const response = await fetch(url, options)
  const json = await response.json()
  if (!response.ok) {
    throw new Error(json.error ?? `HTTP ${response.status}`)
  }
  setStatus("就绪")
  return json
}

function renderWorkflowReview(review) {
  const goalBlock = document.querySelector(".summary-block")
  if (goalBlock) {
    goalBlock.innerHTML = `<h3>目标</h3><p>${escapeHtml(review.goal ?? "尚未选择工作流证据")}</p>`
  }
  for (const key of [
    "stepsAttempted",
    "toolsAndPluginsUsed",
    "contextUsed",
    "uncertaintyPoints",
    "suggestedAdjustments"
  ]) {
    const list = document.querySelector(`[data-review-list="${key}"]`)
    if (!list) {
      continue
    }
    list.innerHTML = ""
    const values = Array.isArray(review[key]) ? review[key] : []
    if (values.length === 0) {
      const item = document.createElement("li")
      item.className = "state-empty"
      item.textContent = "暂无证据"
      list.append(item)
      continue
    }
    for (const value of values) {
      const item = document.createElement("li")
      item.textContent = value
      list.append(item)
    }
  }
}

function writeOutput(name, value) {
  const target = document.querySelector(`[data-output="${name}"]`)
  if (!target) {
    return
  }
  target.classList.remove("state-error")
  target.textContent = JSON.stringify(value, null, 2)
}

function writeError(name, error) {
  const target = document.querySelector(`[data-output="${name}"]`)
  if (!target) {
    return
  }
  target.classList.add("state-error")
  target.textContent = error instanceof Error ? error.message : String(error)
}

async function withButton(button, handler) {
  try {
    button.disabled = true
    await handler()
  } catch (error) {
    writeError(state.activePanel, error)
    setStatus("错误")
  } finally {
    button.disabled = false
  }
}

function setStatus(text) {
  const node = document.querySelector("[data-status-text]")
  if (node) {
    node.textContent = text
  }
}

function valueOf(id) {
  const input = document.getElementById(id)
  return input?.value?.trim() ?? ""
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
}
