# P1 MVP 内测说明

日期：2026-06-13

本文档用于 Task 31-37 的第一轮内测。目标是确认 `myhanako` 已经从只读诊断扩展到最小可用的「工作流复盘 + 插件实验室」体验，并且 UI、端到端 smoke、导出和文档可以被重复验证。

## 范围

本轮完成范围：

| Task | 状态 | 产出 |
| ---: | --- | --- |
| 31 | 完成 | `assets/standalone.html`、`assets/myhanako-app.css`、`assets/myhanako-app.js` 提供最小 standalone UI。 |
| 32 | 完成 | `GET /api/plugins/myhanako/status` 在未传 `pluginId` 时返回 Hana embedded UI。 |
| 33 | 完成 | 「工作流复盘」页面展示 goal、steps、tools/plugins、context、uncertainty、adjustments 和原始 JSON 输出。 |
| 34 | 完成 | 「插件实验室」页面支持 status、surface listing、reload、invoke tool、plugin-private session create 操作入口。 |
| 35 | 完成 | 空状态和错误状态通过 `.state-empty`、`.state-error` 明确显示。 |
| 36 | 完成 | `npm run smoke:p1-mvp` 覆盖 standalone UI、embedded route、lab action API、review、draft、bundle 和文档检查。 |
| 37 | 完成 | README 英文版、README 中文版和本内测说明更新到 P1 MVP 状态。 |

## 前置条件

- Node.js `>=24.0.0`。
- 已运行 `npm install`。
- 如果要做真实 Hana embedded 验证，需要 HanaAgent 已启动，并且 `myhanako` dev plugin 已加载或可 reload。
- mutating Plugin Lab action 必须显式打开实验模式。只读 `plugin.list_surfaces` 可以在 observe-only 状态下运行。

## 快速验证

在仓库根目录运行：

```powershell
npm run smoke:p1-mvp
```

成功输出应为 JSON，且 `ok` 为 `true`：

```json
{"ok":true,"checks":["standalone-ui","embedded-route","lab-action-api","workflow-review-api","draft-api","bundle-api","docs"]}
```

完整验证：

```powershell
npm test
npm run typecheck
git diff --check
```

## Standalone UI 验证

直接用浏览器打开：

```text
assets/standalone.html
```

验收点：

- 第一屏可见「工作流复盘 · 插件实验室」。
- 顶部 tab 包含「工作流复盘」「插件实验室」「证据导出」。
- 工作流复盘默认显示「尚未选择工作流证据」。
- 插件实验室显示「实验模式」开关和 action 按钮。
- 证据导出显示「导出脱敏包」和 adjustment draft 输入区。
- 在 sidecar 未启动时，操作按钮应在输出区域显示错误状态，而不是让页面空白或崩溃。

## Hana Embedded UI 验证

Hana dev plugin route：

```text
GET /api/plugins/myhanako/status
```

无 `pluginId` 查询参数时返回嵌入式 HTML UI。带 `pluginId` 查询参数时仍保留 diagnostics JSON：

```text
GET /api/plugins/myhanako/status?pluginId=myhanako
```

验收点：

- embedded UI HTML 包含 `data-myhanako-app` 和 `data-mode="embedded"`。
- diagnostics JSON 在 sidecar 不可用时返回 degraded，而不是 500。
- `POST /api/plugins/myhanako/lab/actions` 仍可用于真实 Hana EventBus fallback。

## 插件实验室操作边界

只读或低风险入口：

- `plugin.list_surfaces`
- plugin status read

需要实验模式的入口：

- `plugin.install_dev`
- `plugin.reload_dev`
- `plugin.invoke_tool`
- `session.create_plugin_private`
- `session.send_lab_message`

注意：`session.send_lab_message` 可能触发模型执行，内测时不要在真实用户 session 上直接运行。

## 工作流复盘与导出

本地 core handler 支持：

- `GET /v1/sessions/{sessionId}/workflow-review`
- `POST /v1/workflow-adjustments/draft`
- `GET /v1/workflow-adjustments/{draftId}`
- `POST /v1/workflow-adjustments/{draftId}/confirm`
- `POST /v1/evidence-bundles`

验收点：

- workflow review 从 evidence JSONL 投影，不直接修改 session。
- 用户自然语言反馈只生成 draft，`requiresConfirmation` 必须为 `true`。
- evidence bundle 必须是 redacted 输出。

## 已知限制

- 当前 UI 是无框架静态 UI，不包含复杂路由、用户账户或持久浏览器状态。
- Standalone UI 默认调用 `http://127.0.0.1:14501` sidecar；如果本地 server 没启动，会显示错误状态。
- Hana embedded UI 的真实 action 依赖 HanaAgent 当前 dev plugin/EventBus 接口。
- 当前 repo 还没有贡献真实 plugin tool，因此缺失 tool 的 invoke smoke 返回 `PLUGIN_DEV_TOOL_NOT_FOUND` 属于预期边界。

## 升级或回归检查

当 HanaAgent 插件接口变化时，优先检查：

1. `src/hana/adapter.ts` 的 capability 名称和 payload。
2. `src/hana/plugin/routes/status.ts` 的 embedded UI 与 diagnostics JSON 分支。
3. `src/server/api.ts` 的 draft、bundle、review API。
4. `npm run smoke:p1-mvp` 是否仍然通过。
