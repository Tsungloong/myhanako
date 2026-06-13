# myhanako

这是给人阅读的中文版 README。英文版入口见 [README.md](README.md)，英文版主要用于工具、自动化和 coding agent 读取，尽量避免中文编码在不同终端或工具链里显示异常。

## 项目概览

`myhanako` 是面向 HanaAgent 的 workflow companion 和 runtime lab。它不是 fork，也不替代 HanaAgent。HanaAgent 仍然负责真实执行、session、tool、model、plugin、permission 和桌面产品界面。

`myhanako` 的职责是：审查、解释、受控实验、记录 evidence、生成 workflow adjustment draft，以及导出脱敏 evidence bundle。

## 当前状态

项目处于 P1：`Workflow Review + Plugin Lab`。

当前已经完成并验证的范围：

- P0 历史基础：session event contract、append-only `SessionEventLog`、`PromptBundle`、PromptAssembler 和 prompt/memory/tools/model request evidence。
- P1 第一批收口：evidence envelope、append-only evidence log、redaction policy、Hana diagnostics adapter、evidence ingest handler、Hana full-access plugin manifest、status route、diagnostics evidence、read-only workflow review projection。
- P1 Task 19-30 收口：受控 Plugin Lab action、plugin-private lab session create、workflow adjustment draft、redacted evidence bundle export。
- P1 Task 31-37 收口：standalone UI、Hana embedded UI、Workflow Review 页面、Plugin Lab 页面、空状态/错误状态、MVP smoke 脚本和内测文档。

## 真实 Hana Smoke

已在运行中的 HanaAgent `0.310.1` 上验证：

- `myhanako` dev plugin reload 成功，plugin 状态保持 `loaded`。
- 调用 `POST /api/plugins/myhanako/lab/actions` 执行 `plugin.list_surfaces`：通过 `plugin.dev.listSurfaces` 完成，返回 1 个 surface，并写入 `lab.action.completed` evidence。
- 调用 `POST /api/plugins/myhanako/lab/actions` 执行 `session.create_plugin_private`：通过 `session:create` 完成，返回 `visibility: "plugin_private"`、`ownerPluginId: "myhanako"` 和 `kind: "myhanako.lab"`，并写入 evidence。
- `plugin.dev.invokeTool` 路径可达。调用缺失 tool 时返回 `PLUGIN_DEV_TOOL_NOT_FOUND`，这是预期结果，因为当前 repo 还没有贡献真实 tool。

`session.send_lab_message` 已实现并有测试覆盖，但没有在真实 HanaAgent 中执行，因为 `session:send` 可能触发模型调用。

## 架构

```text
HanaAgent Runtime
  -> myhanako full-access plugin
    -> Hana adapter layer
      -> evidence protocol and append-only log
        -> workflow review, lab actions, drafts, export APIs, and MVP UI
```

关键边界：

- core 模块不能 import HanaAgent 私有 runtime module。
- Hana 集成通过 plugin route context 和 EventBus adapter 完成。
- 会改变状态或触发执行的 lab action 必须显式传入 `labMode: true`。
- workflow adjustment feedback 只生成 draft，不静默执行 workflow change。
- evidence export 必须脱敏 secret、credential-like string、private key、cookie 和本机用户路径段。

## 目录说明

- `src/shared/evidence.ts`：P1 evidence envelope 类型和校验。
- `src/core/evidence-log.ts`：append-only JSONL evidence log。
- `src/core/redaction.ts`：导出和 lab evidence 的脱敏策略。
- `src/core/workflow-review.ts`：只读 workflow review projection。
- `src/core/workflow-adjustments.ts`：workflow adjustment draft store 和 feedback-to-draft 映射。
- `src/core/evidence-bundle.ts`：redacted evidence bundle export。
- `src/hana/adapter.ts`：Hana EventBus adapter，覆盖 diagnostics、dev plugin actions、surface listing 和 plugin-private session。
- `src/hana/plugin/index.ts`：Plugin Lab 编排和 evidence 写入。
- `src/hana/plugin/routes/status.ts`：Hana plugin route，提供 embedded UI、diagnostics JSON 和 `/lab/actions`。
- `src/ui/app-shell.ts`：standalone/embedded UI shell 渲染器。
- `assets/`：P1 MVP 浏览器 UI 静态资源。
- `scripts/p1-mvp-smoke.mjs`：P1 MVP smoke 脚本，覆盖 UI、embedded route、lab action API、workflow review、draft、bundle 和文档检查。
- `routes/status.ts`：Hana dev plugin 加载使用的根 route wrapper。
- `src/server/api.ts`：本地 core handler，覆盖 evidence ingest、workflow review、lab actions、drafts 和 bundles。
- `tests/`：Node 测试，覆盖 contract、API handler、P1 fixture loop、lab action、draft、bundle、UI shell 和 MVP smoke。
- `docs/p1-task-19-30-closeout.md`：Task 19-30 中文收口记录。
- `docs/p1-mvp-internal-test.md`：Task 31-37 中文内测说明。

## Hana Dev Plugin

根目录的 `manifest.json` 是 Hana dev plugin descriptor。安装或 reload 时应指向仓库根目录，不要指向 `src/hana/plugin` 子目录。

Hana dev source path 可能需要放在：

```text
${HANA_HOME}/plugin-dev-sources/
```

本次真实 smoke 中使用的路径是：

```text
${HANA_HOME}/plugin-dev-sources/myhanako-smoke
```

## 本地命令

安装依赖：

```powershell
npm install
```

运行 P1 MVP smoke：

```powershell
npm run smoke:p1-mvp
```

运行全部测试：

```powershell
npm test
```

运行类型检查：

```powershell
npm run typecheck
```

检查 diff 中的空白问题：

```powershell
git diff --check
```

推荐完整验证：

```powershell
npm run smoke:p1-mvp
npm test
npm run typecheck
git diff --check
```

## UI 入口

Standalone UI：

```text
assets/standalone.html
```

Hana embedded UI：

```text
GET /api/plugins/myhanako/status
```

diagnostics JSON：

```text
GET /api/plugins/myhanako/status?pluginId=myhanako
```

## API 摘要

本地 core handler routes：

- `POST /v1/evidence`
- `GET /v1/sessions/{sessionId}/workflow-review`
- `GET /v1/plugins/{pluginId}/lab`
- `POST /v1/lab/actions`
- `POST /v1/workflow-adjustments/draft`
- `GET /v1/workflow-adjustments/{draftId}`
- `POST /v1/workflow-adjustments/{draftId}/confirm`
- `POST /v1/evidence-bundles`

Hana plugin routes：

- `GET /api/plugins/myhanako/status`
- `GET /api/plugins/myhanako/status?pluginId={pluginId}`
- `POST /api/plugins/myhanako/lab/actions`

## 安全说明

- 不要在缺少显式 `labMode: true` 的情况下执行 mutating Plugin Lab action。
- 不要静默修改真实用户 session。
- 不要导出未脱敏 raw evidence。
- 不要把 secret、private config 或 runtime data 放进 plugin `assets/`。
- Hana dev APIs 仍应视为 experimental；依赖具体行为前需要用当前 HanaAgent 版本验证。

## 当前验证

最新验证命令：

```powershell
npm run smoke:p1-mvp
npm test
npm run typecheck
git diff --check
```
