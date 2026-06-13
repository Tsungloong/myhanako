# P1 Task 19-30 收口说明

日期：2026-06-13

已验证 HanaAgent 版本：`0.310.1`

## 范围

Task 19-30 的目标是让 Plugin Lab 从“只读诊断”扩展到可控的 dev plugin
操作、plugin-private lab session、workflow adjustment draft 和 redacted
evidence export。

本次收口完成的是 contract/core/API 层，不包含 Task 31-37 的 standalone UI
或 Hana embedded UI 页面。

## 任务状态

| Task | 状态 | 说明 |
| ---: | --- | --- |
| 19 | 完成 | `HanaAdapter.installDevPlugin()` 映射到 `plugin.dev.install`；Plugin Lab action `plugin.install_dev` 会写入 `lab.action.*` evidence。 |
| 20 | 完成 | `HanaAdapter.reloadDevPlugin()` 映射到 `plugin.dev.reload`；真实 Hana smoke 已成功 reload `myhanako`。 |
| 21 | 完成，真实环境有边界 | `HanaAdapter.invokePluginTool()` 映射到 `plugin.dev.invokeTool`；contract test 覆盖成功路径。真实 Hana 调用缺失工具时返回 `PLUGIN_DEV_TOOL_NOT_FOUND`，这是预期结果，因为当前 repo 还没有贡献真实 tool。 |
| 22 | 完成 | `plugin.list_surfaces` 映射到 `plugin.dev.listSurfaces`；真实 Hana route action 返回 1 个 page surface，并写入 evidence。 |
| 23 | 完成 | `session.create_plugin_private` 映射到 `session:create`，创建时带 `ownerPluginId`、`kind: "myhanako.lab"` 和 `visibility: "plugin_private"`；真实 Hana smoke 已确认这些字段。 |
| 24 | 已实现，未真实发送 | `session.send_lab_message` 映射到 `session:send` 并记录 evidence。真实环境未执行，因为 `session:send` 可能触发模型调用。 |
| 25 | 完成 | mutating lab action 必须显式传 `labMode: true`；被拒绝的 action 写入 `lab.action.denied`，不会调用 Hana。 |
| 26 | 完成 | 新增 `WorkflowAdjustmentDraft` 模型、JSONL event store、校验和确认状态投影。 |
| 27 | 完成 | sidecar handler 支持 draft create/read/confirm API。 |
| 28 | 完成 | 自然语言反馈只生成可确认 draft，不自动执行任何 workflow change。 |
| 29 | 完成 | `buildEvidenceBundle()` 支持按 session/plugin 过滤并导出 redacted evidence bundle。 |
| 30 | 完成 | redaction 扩展到更多 credential 字段名、credential-like 字符串、private key 字符串、cookie 和本机用户路径段。 |

## API

本地 sidecar/core handler 新增：

- `POST /v1/lab/actions`
- `POST /v1/workflow-adjustments/draft`
- `GET /v1/workflow-adjustments/{draftId}`
- `POST /v1/workflow-adjustments/{draftId}/confirm`
- `POST /v1/evidence-bundles`

Hana plugin route 新增：

- `POST /api/plugins/myhanako/lab/actions`

## 真实 Hana Smoke

本次真实验证将源码同步到
`${HANA_HOME}/plugin-dev-sources/myhanako-smoke`，再通过 Hana dev plugin
reload 加载。

已验证：

- `myhanako` reload 后状态为 `loaded`。
- 通过 `/api/plugins/myhanako/lab/actions` 执行 `plugin.list_surfaces`：
  返回 `completed`，capability 为 `plugin.dev.listSurfaces`，返回 1 个
  surface，并写入 `lab.action.completed` evidence。
- 通过 `/api/plugins/myhanako/lab/actions` 执行
  `session.create_plugin_private`：返回 `completed`，capability 为
  `session:create`，结果包含 `visibility: "plugin_private"`、
  `ownerPluginId: "myhanako"` 和 `kind: "myhanako.lab"`，并写入
  `lab.action.completed` evidence。
- `plugin.dev.invokeTool` 路径可达；调用缺失工具返回
  `PLUGIN_DEV_TOOL_NOT_FOUND`，在当前 repo 没有真实 tool contribution 的情况下
  属于预期结果。

未在真实 Hana 中执行：

- `session.send_lab_message`。原因是 `session:send` 可能触发模型执行；该路径已经由
  adapter 和 Plugin Lab 测试覆盖。

## 实现位置

- `src/hana/adapter.ts`：Hana EventBus adapter，负责 dev plugin action、
  surface listing 和 plugin-private session action。
- `src/hana/plugin/index.ts`：Plugin Lab 编排层，负责 lab-mode gate、action
  到 adapter 的映射、action history evidence 和 diagnostics evidence。
- `src/hana/plugin/routes/status.ts`：Hana route，提供 `/status` 和
  `/lab/actions`。其中包含 EventBus fallback，用于处理 dev reload 时运行中的
  Hana 进程仍缓存旧 core lab module 的情况。
- `src/core/workflow-adjustments.ts`：append-only workflow adjustment draft
  store，以及 feedback-to-draft 映射。
- `src/core/evidence-bundle.ts`：redacted evidence bundle builder。
- `src/core/redaction.ts`：export redaction policy。
- `src/server/api.ts`：本地 handler API，暴露 lab actions、drafts 和 bundles。

## 安全边界

- mutating lab action 默认拒绝，必须显式 `labMode: true`。
- workflow adjustment draft 不会自动修改 Hana workflow，必须等待确认。
- evidence bundle 默认通过 redaction 处理敏感字段、credential-like 字符串、
  private key、cookie 和本机用户路径段。
- P1 当前不做真实用户 session 的静默修改。

## 验证命令

```powershell
npm test
npm run typecheck
git diff --check
```
