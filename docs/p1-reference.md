# myhanako P1 事实源入口

日期：2026-06-07
阶段：P1 新基准
主题：`Workflow Review + Plugin Lab`

## 参考级别

P1 后续讨论、拆解和实现按以下优先级取证：

1. 本文件：定义 P1 当前事实源、参考顺序、边界和待确认项。
2. [p1-design.md](p1-design.md)：P1 的产品、架构、协议、API、存储、安全、失败模式、测试和验收设计。
3. [p1-implementation-plan.md](p1-implementation-plan.md)：P1 第一批工程实施计划。
4. `F:\openhanako-main`：HanaAgent 当前本地源码和插件文档；目标 commit 确认后以其为准，确认前临时以本地工作树为准。
5. `F:\HanakoPro-main`：成熟体验参考，不能直接当作 HanaAgent 当前能力事实。
6. [design.md](design.md) 与 [implementation-plan.md](implementation-plan.md)：P0 历史基线，只保留设计思想，不单独决定 P1 路线。

未进入上述链路的早期讨论、零散设想和未核对材料，不作为 P1 实现依据。

## P1 判断

myhanako 迎来阶段性转向：

- 旧方向：自建 PiAgent 原生桌面 Agent 内核。
- 新方向：HanaAgent 的 workflow companion 与 runtime lab。

P1 不追求替代 HanaAgent，而是进入 HanaAgent 的插件生态：

- HanaAgent 是 execution product 与 plugin host。
- myhanako 是 review、explain、adjust、record、experiment 层。
- P1 通过 full-access plugin、adapter、sidecar/core、evidence protocol 和 UI shells 组成。

这个转向保留 P0 的核心设计资产，但改变实现落点：

| P0 资产 | P1 落点 |
| --- | --- |
| `SessionEventLog` | append-only evidence log |
| `PromptBundle` | prompt/tool/model evidence projection |
| 可控记忆 | workflow adjustment draft 与 reviewable preference record |
| Diff/终端透明 | evidence bundle 与后续 replay 能力 |
| plugin/skill 边界 | Hana full-access plugin + lab permission domains |
| 安全边界 | redaction、localhost sidecar token、read-only attachment、explicit lab mode |

## 已核对事实

本轮已核对或保留为当前事实源的材料。以下内容是 2026-06-07 基于 `F:\openhanako-main` 本地工作树的能力快照，HanaAgent 更新后必须重新核对：

- `F:\openhanako-main` 存在，包含 HanaAgent 当前本地源码、`package.json`、`PLUGINS.md`、`PLUGIN_SDK.md`、`core`、`server`、`plugins`、`shared` 等目录。
- `F:\openhanako-main\package.json` 记录目标 HanaAgent 包名为 `hanako`，版本为 `0.301.8`，`type` 为 `module`，产品描述为 `HanaAgent - a personal AI agent with memory and soul`。
- `F:\openhanako-main\package.json` 的 Node engine 为 `>=24.12.0 <25`。
- `F:\openhanako-main\package.json` 中与 P1 插件/宿主/运行时最相关的依赖版本包括：`@hono/node-server@^1.19.11`、`@hono/node-ws@^1.3.0`、`hono@^4.12.9`、`@mariozechner/pi-ai@0.70.5`、`@mariozechner/pi-coding-agent@0.70.2`、`chokidar@^5.0.0`、`ws@^8.18.0`、`react@^19.2.4`、`react-dom@^19.2.4`、`vite@^7.3.1`、`typescript@^5.9.3`、`vitest@^4.0.18`、`electron@42.3.0`。
- `F:\openhanako-main\PLUGIN_SDK.md` 确认 SDK 包分层：`@hana/plugin-protocol` 用于 iframe/host 协议，`@hana/plugin-sdk` 用于 iframe browser code，`@hana/plugin-runtime` 用于 plugin Node runtime，`@hana/plugin-components` 用于 iframe React UI。
- `F:\openhanako-main\PLUGIN_SDK.md` 确认 Agent dev loop：源码保留在 workspace 或 `${HANA_HOME}/plugin-dev-sources/`；`plugin.dev.install` 复制到 `${HANA_HOME}/plugins-dev/<pluginId>` 并通过正常 `PluginManager` 加载；`plugin.dev.reload` 从同一 source slot 替换 dev copy；`plugin.dev.invokeTool` 做显式输入的 tool smoke test；`plugin.dev.diagnostics` 返回 dev slots、load status、logs、surfaces 和 plugin diagnostics；`plugin.dev.listSurfaces` 与 `plugin.dev.describeSurfaceDebug` 用于 UI 调试。
- `F:\openhanako-main\PLUGIN_SDK.md` 确认 Agent 可调用 dev tools 默认关闭，必须由用户在 Settings -> Plugins 启用 `Allow Agent plugin dev tools` 后，Agent 才能看到 `plugin_dev_install`、`plugin_dev_reload`、`plugin_dev_disable`、`plugin_dev_enable`、`plugin_dev_reset`、`plugin_dev_uninstall`、`plugin_dev_invoke_tool`、`plugin_dev_diagnostics`、`plugin_dev_list_surfaces`、`plugin_dev_describe_surface`、`plugin_dev_run_scenario`。
- `F:\openhanako-main\PLUGIN_SDK.md` 确认 dev lifecycle 控制可传 `devRunId` 作为活动 dev slot 护栏；可信开发身份来自 Hana install record 与 `${HANA_HOME}/plugins-dev/` slot，不来自 manifest 字段。
- `F:\openhanako-main\PLUGIN_SDK.md` 确认 runtime session/agent typed helpers 示例包括 `createAgent`、`createSession`、`getAgentProfile`、`listSessions`、`sendSessionMessage`、`subscribeSessionEvents`；`visibility: 'plugin_private'` 会让 plugin-owned agents/sessions 默认不出现在 Hana 主 agent/session 列表，owner plugin 可用 `listAgents(ctx, { ownerPluginId: ctx.pluginId })` 或 `listSessions(ctx, { ownerPluginId: ctx.pluginId })` 查询自己的对象。
- `F:\openhanako-main\PLUGIN_SDK.md` 确认 `session:send` 的 `context.system`、`context.beforeUser`、`context.afterUser` 只注入当轮 provider request，不改写可见用户消息，完成后清除。
- `F:\openhanako-main\PLUGIN_SDK.md` 确认 Pi SDK extension factories 位于 `extensions/*.js`，仅 full-access plugin 加载；用途是 request-pipeline hooks，例如 provider request rewriting、context filtering、tool-call observation；普通 tool 行为应使用 `tools/*.js`。
- `F:\openhanako-main\PLUGINS.md` 确认 dev plugin loop 的 HTTP 对应入口：`POST /api/plugins/dev/install`、`POST /api/plugins/dev/:id/reload`、`PUT /api/plugins/dev/:id/enabled`、`POST /api/plugins/dev/:id/reset`、`DELETE /api/plugins/dev/:id`、`POST /api/plugins/dev/:id/tools/:toolName/invoke`、`GET /api/plugins/dev/diagnostics`。
- `F:\openhanako-main\PLUGINS.md` 确认 UI 调试顺序：先用 `plugin.dev.listSurfaces` 找 page/widget，再用 `plugin.dev.describeSurfaceDebug` 获取 element-first debug descriptor；语义元素优先，截图主要用于视觉确认、布局检查或语义信息不足时兜底。
- `F:\openhanako-main\PLUGINS.md` 确认 `routes/*.js` 需要 full-access，支持工厂函数、静态 Hono app、`register(app, ctx)` 三种写法，并自动挂载到 `/api/plugins/{pluginId}/...`。
- `F:\openhanako-main\PLUGINS.md` 确认 plugin route 可通过 `ctx.bus` 调用内置 session/agent 操作：`session:create`、`session:get`、`session:update`、`session:send`、`session:abort`、`session:history`、`session:list`、`agent:list`、`agent:profile`、`agent:create`、`agent:update`；所有针对已有 session 的操作必须带 `sessionPath`。
- `F:\openhanako-main\PLUGINS.md` 确认 page/widget 均需 full-access，均通过 iframe 渲染；manifest 中 `contributes.page.route` 或 `contributes.widget.route` 的实际 URL 为 `/api/plugins/{pluginId}{route}`。
- `F:\openhanako-main\PLUGINS.md` 确认 iframe SDK host capability：`toast.show` 无需授权，`external.open` 与 `clipboard.writeText` 需要在 manifest `ui.hostCapabilities` 声明；未声明敏感能力返回 `CAPABILITY_DENIED`，未知能力加载时忽略。
- `F:\openhanako-main\PLUGINS.md` 确认静态前端资源位于 plugin `assets/`，宿主通过 `/api/plugins/{pluginId}/assets/...` 服务；入口 route 认证后宿主下发仅作用于该 assets path 的 HttpOnly 短会话 cookie；源码、密钥、私有配置和运行时数据不能放入 `assets/`。
- `F:\openhanako-main\PLUGINS.md` 确认 EventBus：`bus.handle` 需要 full-access，`bus.request` 所有插件可用；`bus.listCapabilities()` 与 `bus.getCapability(type)` 可读取能力目录；推荐用 `@hana/plugin-runtime` 的 `defineBusHandler()`、`requestBus()`、`HANA_BUS_SKIP`。
- `F:\openhanako-main\PLUGINS.md` 确认内置 EventBus 能力包括 `session:create`、`session:get`、`session:list`、`session:update`、`session:send`、`session:abort`、`session:history`、`agent:list`、`agent:profile`、`agent:create`、`agent:update`、`model:sample-text`、`provider:media-providers`、`provider:resolve-media-model`、`media:generate-image`。
- `F:\openhanako-main\core\plugin-dev-service.ts` 确认 `PLUGIN_DEV_EVENT_BUS_CAPABILITIES` 声明了 `plugin.dev.install`、`plugin.dev.reload`、`plugin.dev.disable`、`plugin.dev.enable`、`plugin.dev.reset`、`plugin.dev.uninstall`、`plugin.dev.invokeTool`、`plugin.dev.diagnostics`、`plugin.dev.listSurfaces`、`plugin.dev.describeSurfaceDebug`、`plugin.dev.getScenarios`、`plugin.dev.runScenario`。
- `F:\openhanako-main\core\plugin-dev-service.ts` 确认 `plugin.dev.install` input 可包含 `sourcePath`、`path`、`pluginId`、`allowFullAccess`；`plugin.dev.reload` input 需要 `pluginId`，可包含 `devRunId`、`allowFullAccess`；`plugin.dev.invokeTool` input 需要 `pluginId`、`toolName`，可包含 `input`、`sessionPath`、`agentId`；`plugin.dev.diagnostics` 和 `plugin.dev.listSurfaces` 可按 `pluginId` 过滤。
- `F:\openhanako-main\core\plugin-dev-service.ts` 确认 `installFromSource()` 解析 source dir、读取并校验 descriptor，然后 `_installDescriptor()` 复制源码、调用 `PluginManager.installPlugin(..., { source: "dev", pluginId, allowFullAccess })`、同步 plugin extensions、写入 dev run record，并记住 slot 的 `sourcePath`、`targetDir`、`allowFullAccess`、`lastDevRunId`。
- `F:\openhanako-main\core\plugin-dev-service.ts` 确认 `reloadPlugin()`、`enablePlugin()`、`resetPlugin()` 使用 `devRunId` 校验 active dev slot；`devRunId` 不匹配会抛出 `PLUGIN_DEV_RUN_ID_MISMATCH`。
- `F:\openhanako-main\core\plugin-dev-service.ts` 确认 `listSurfaces(pluginId)` 从 `PluginManager.getPages()` 和 `PluginManager.getWidgets()` 汇总 page/widget，并返回 `kind`、`pluginId`、`title`、`route`、`routeUrl`、`hostCapabilities`。
- `F:\openhanako-main\core\plugin-dev-service.ts` 确认 `registerEventBusHandlers(bus)` 通过 `bus.handle()` 注册 `plugin.dev.*` handlers。
- `F:\openhanako-main\core\plugin-context.ts` 确认 `createPluginContext()` 返回 `pluginId`、`pluginKey`、`source`、`pluginDir`、`dataDir`、`capabilities`、`sensitiveCapabilities`、`bus`、`config`、`log`、`registerSessionFile`、`stageFile`；full-access plugin 获得原始 `bus`，restricted plugin 获得 `createRestrictedBusProxy()`。
- `F:\openhanako-main\core\plugin-context.ts` 确认 restricted bus proxy 提供 `emit`、`subscribe`、`request`、`hasHandler`、`listCapabilities`、`getCapability`，并对 `llm_usage` 相关读写按 `usage.read` 权限限制。
- `F:\openhanako-main\core\plugin-context.ts` 未在该文件中确认 `createAgent`、`createSession`、`listAgents`、`listSessions` 等 typed helper 实现；这些 helper 名称目前仅按 `PLUGIN_SDK.md` 与 `PLUGINS.md` 记录为 SDK/文档事实。
- `F:\openhanako-main\server\routes\plugins.ts` 确认 HTTP dev loop endpoints 的实现与 `PLUGINS.md` 对齐：install/reload/enable-disable/reset/uninstall/tool invoke/diagnostics/surfaces/describe/scenarios。
- `F:\openhanako-main\server\routes\plugins.ts` 确认 `POST /api/plugins/dev/install` body 使用 `sourcePath || path`、`pluginId`、`allowFullAccess`；`POST /api/plugins/dev/:id/reload` body 使用 `devRunId`、`allowFullAccess`；`PUT /api/plugins/dev/:id/enabled` body 使用 `enabled`、`devRunId`、`allowFullAccess`；`POST /api/plugins/dev/:id/tools/:toolName/invoke` body 使用 `input`、`sessionPath`、`agentId`；`GET /api/plugins/dev/diagnostics` 与 `GET /api/plugins/dev/surfaces` 使用 query `pluginId`。
- `F:\openhanako-main\server\routes\plugins.ts` 确认 `/api/plugins/:pluginId/assets/*` 由 `servePluginAsset()` 服务，plugin catch-all route 位于 assets route 之后，`route.all("/plugins/:pluginId/*", ...)` 转发到 plugin route app。
- 当前 `F:\Codex-Workspace\myhanako` 已有 P0 shared event contract、append-only `SessionEventLog`、PromptBundle、PromptAssembler 和 session projection 相关代码；P1 不能把旧 desktop projection 当作事实源，也不能覆盖当前未提交的 `shared/*` 改动。

具体 HanaAgent commit hash 尚未在本轮任务中确认；当前核对以 `F:\openhanako-main` 本地工作树的上述文件内容为准。

## P1 目标

P1 的目标是交付一个可落地的闭环：

1. 开发者或高级用户选择 dev plugin、Hana session 或 workflow attempt。
2. myhanako 用适合用户层级的方式解释发生了什么。
3. 用户可以调整 workflow、plugin、tool、prompt context 或实验目标。
4. HanaAgent 负责真实执行。
5. myhanako 记录 evidence，并让结果可审查、可导出、可复现。

## P1 非目标

P1 明确不做：

- HanaAgent 通用聊天客户端 fork。
- 通用模型设置、marketplace 或普通 Hana settings 管理。
- 真实用户 session 的静默修改。
- 绕过 HanaAgent permission system。
- 对 HanaAgent renderer store、React component 或私有 runtime module 的硬依赖。
- 完整 file replay、terminal replay、memory graph、provider rewrite 或 real-session intervention。

## P1 第一批工程入口

第一批实现顺序应保持最小闭环：

1. HanaAgent 插件事实核对与 reference 更新。
2. evidence envelope 与 append-only log。
3. redaction policy。
4. Hana adapter capability discovery 与 `readPluginDiagnostics` 降级契约。
5. sidecar evidence ingest API。
6. `myhanako` full-access plugin shell 与 plugin lab diagnostics evidence。
7. read-only workflow review projection。

任何功能只要需要修改真实 Hana session，默认推迟到 P2 或更晚，并必须重新设计权限和确认流程。

## P1 第一批收口状态

2026-06-13 的本地收口实现新增了 diagnostics evidence fixture 闭环：

- 根目录 `manifest.json` 是当前 myhanako Hana dev plugin source descriptor；Hana dev install source 应指向仓库根目录，而不是 `src/hana/plugin` 子目录，确保 route wrapper 可以引用 `src` 内实现。
- 根目录 `routes/status.ts` 是 Hana route wrapper，转发到 `src/hana/plugin/routes/status.ts`；route 注册 `/status`，有 `ctx.bus` 与 `ctx.dataDir` 时会构建 log-backed diagnostics lab，缺少依赖或 sidecar 不可用时返回结构化 `degraded`。
- `src/hana/plugin/index.ts` 提供 `createHanaEventBusAdapter(ctx)`，把 Hana plugin context 的 `ctx.bus` 绑定到 `HanaAdapter`。
- `createLogBackedPluginLab()` 把 `HanaAdapter.readPluginDiagnostics()`、metadata 分配、redaction policy 和 `EvidenceLog` 串起来；重复 run 自动分配 `labRunId`、`eventId` 和单调 `sequence`。
- diagnostics evidence 写入前经过 `redactEvidenceForExport()`；`rawSource` 默认为 `[REDACTED]`，敏感字段路径写入 `redaction.fields`，日志字符串中的常见 credential 形态也会整值遮蔽。
- `/status?pluginId=...` 的响应区分 `hostPluginId` 与 `targetPluginId`；兼容字段 `pluginId` 表示被诊断目标 plugin。
- `tests/p1-diagnostics-loop.test.ts` 覆盖 manifest、Hana EventBus adapter binding、diagnostics evidence 写入 JSONL、route 从真实 `ctx.bus`/`ctx.dataDir` fallback 写 log、sidecar fail-open、以及同一份 `EvidenceLog` 驱动 workflow review。

当前仍未声称已经完成真实 Hana app 外部 smoke：尚未在固定目标 HanaAgent commit 上执行 `plugin.dev.install`、访问 `/api/plugins/myhanako/status`、并核对 Hana 进程内 route registry。该项需要目标版本窗口固定后执行，结果再写回本文件。

第一批完成后再拆第二批：

- dev plugin reload/invoke smoke test。
- plugin-private session lab。
- workflow adjustment drafts。
- redacted evidence bundle export。
- Hana embedded UI。
- standalone UI。

## 待确认项

- P1 目标 HanaAgent commit 或版本窗口。
- myhanako sidecar 的进程生命周期由 Hana plugin 启动，还是由 standalone UI 启动。
- workflow adjustment drafts 第一版只保存在 myhanako，还是写入 Hana plugin-visible preference record。
- embedded UI 与 standalone UI 的交付顺序。
- evidence bundle 最小格式和脱敏策略的第一版字段。
