# P0 开发进度记录

本文档只记录 P0 实施进度、验证命令和维护状态，不是架构基准。架构判断只以 [design.md](design.md) 为准。

## 当前分支

- 本地分支：`feat/p0-event-log`
- 远程分支：`origin/feat/p0-event-log`
- 当前维护方式：小里程碑验证后提交，定期推送远程分支。

## 已实现

以下 P0/M1-M5 是早期 clean-room 骨架进度。它们继续保留为 contract、mirror、projection、snapshot 和增强层，但不再作为 runtime 主线；当前 runtime 主线以 `docs/design.md` 的 OpenHanako-first P0 为准。

### P0/M1：协议与事件

- `shared/src/session-events.ts`
  - 定义 P0 `SessionEvent` 类型、事件类型集合和 payload contract。
  - 包含 prompt、memory、tool、file、terminal、plugin、interrupt、recall、recovery 等事件。
- `shared/src/session-projection.ts`
  - 从 append-only event log 投影基础 transcript。
  - `message_recalled` 只标记投影状态，不删除历史事件。
- `core/src/session-event-log.ts`
  - 提供 append-only `SessionEventLog`。
  - 支持 per-session sequence、并发 append 串行化、内存存储、JSONL 存储和 replay。

### P0/M2：Prompt 与模型

- `shared/src/prompt-bundle.ts`
  - 定义 `PromptBundle`、`PromptMessage` 和 `ModelRole`。
- `core/src/prompt-assembler.ts`
  - 统一装配 prompt layers。
  - 生成 checksum、token estimate、tokenBudget warning。
  - 写入 `prompt_layers_resolved`、`memory_injected`、`tools_resolved`、`model_request_started`。
- `core/src/model-manager.ts`
  - 参考 OpenHanako/HanakoPro 的成熟模型管理方式，`availableModels` 是模型解析的唯一事实源。
  - 模型引用采用 Hanako-style 复合键：`{ id, provider }` 或 `provider/id`。
  - 运行时边界拒绝裸 `id`，不按 id 猜 provider。
  - 支持 P0 四类模型角色映射，`smallTool` 可对齐 Hanako 的 `utility`，`largeTool` 可对齐 `utility_large`。
  - 支持 provider credentials 解析，DeepSeek strict/tool stable mode 等策略先作为 provider/model 策略字段保留。
  - `BasicModelAdapter` 生成 provider-neutral model request snapshot。
- `shared/src/model-ref.ts`
  - 复用 OpenHanako 的复合模型引用纪律：parse 可以宽松，runtime require/find/key 必须严格。

### P0/M3：plugin/skill/tool 起步

- `core/src/tool-registry.ts`
  - 支持工具注册、重复 id 拒绝、透明 tool definition snapshot。
  - 支持 tool description override，但不允许 override 改变 `schemaChecksum` 或 `permissions`。
  - 工具执行统一经过 registry 边界；配置 `ExecutionBoundary` 后，executor 调用前必须通过权限授权。
- `core/src/resource-access-service.ts`
  - 预留 P0 受限 service facade：subject 只能访问显式声明的 permission。
  - `extension` 资源强制要求 `full-access` subject，保持 `extensions/` 只作为 full-access plugin 兼容入口。
- `core/src/execution-boundary.ts`
  - 预留工具执行入口约束：要求显式 execution subject，按工具声明权限映射资源，并在执行前通过 `ResourceAccessService` 授权。
- `core/src/command-registry.ts`
  - 参考 OpenHanako/HanakoPro slash command registry/dispatcher 边界，命令由用户主动 `/xxx` 输入触发，不伪装成 skill 自动注入。
  - 只向前端暴露 command definition snapshot，不暴露 handler。
  - 支持 name/alias 归一化、核心保留命令保护、按 source/sourceId 卸载和 `command_invoked` 事件记录。
- `core/src/plugin-manager.ts`
  - 实现 P0 最小 plugin manifest/contribution 编排，保持 Hanako-style restricted/full-access 语义。
  - restricted plugin 只允许静态 tools/commands 贡献；routes/providers/extensions/runtime 保留给 full-access metadata，不在 P0 执行 extension code。
  - plugin 贡献通过 `ToolRegistry` / `CommandRegistry` 注册，禁用 plugin 时按 source/sourceId 卸载贡献。
  - 支持本地 plugin manifest 发现/加载：扫描 plugin 根目录或集合目录下的 `plugin.json` / `.codex-plugin/plugin.json`，只加载 manifest metadata，不执行 runtime 或 extension code。
  - 在提供 audit context 时写入 `plugin_loaded`、`plugin_disabled` 和 `plugin_load_failed`，保持 plugin 行为可回放、可审计。
- `core/src/skill-manager.ts`
  - 实现 P0 最小 skill metadata/binding/prompt context 编排，skill 只提供行为模式和 prompt layer，不隐式暴露 `/xxx` command。
  - 支持 built-in/project/user/plugin 来源、session/project/mode/global 绑定、priority 排序、enabled/disabled 状态和 prompt 级 conflict 剔除。
  - 向 `PromptAssembler` 提供 `skill:*` prompt layers 与 `enabledSkillIds`，后续可继续接入 OpenHanako/HanakoPro 风格的丰富角色与技能路径发现。

### P0/M4：记忆闭环起步

- `core/src/memory-service.ts`
  - 定义 P0 `MemoryItem`、scope、status、visibility 和内存存储接口。
  - 支持用户可见记忆创建、修正、删除，并写入 `memory_item_created`、`memory_item_updated`、`memory_item_deleted`。
  - 支持 `JsonlMemoryStore`，用 upsert/delete tombstone 记录折叠出当前记忆状态，作为 `PIAGENT_HOME/memory` 持久化预留。
  - 暴露 `getItem` 与 `getSourceReference`，为桌面记忆面板的来源跳转保留稳定接口。
- `core/src/memory-compiler.ts`
  - 将 active、未过期、scope 匹配的记忆编译成 `memory:*` prompt layers。
  - 按 `pinned`、`facts`、`today`、`week`、`longterm`、`project`、`teaching` 分层，保留 memory id 和 source event id 供来源跳转。
  - 写入 `memory_compiled`；最终 prompt 注入仍由 `PromptAssembler` 记录 `memory_injected`，避免第二事实源。

### P0/M5：文件受控链路起步

- `core/src/workspace-service.ts`
  - 新增 `WorkspaceService`，所有文件读取先经过 workspace root 路径策略，产生 `file_snapshot_read`。
  - 新增 `PatchService` 与 `PatchModel`，以 full-file replacement 作为 P0 最小 patch 事实模型，产生 `file_patch_proposed`。
  - `WorkspaceService.commitPatch` 在写入前校验 base checksum，避免覆盖用户或外部进程的新改动，并产生 `file_write_committed`。
  - `core/src/diff-service.ts` 新增 `DiffService.renderDiffModel`，把 `PatchModel` 渲染为 UI-neutral `DiffModel`，包含语言、checksum、hunks、old/new 行号和 context/delete/insert 行。
  - 先稳定 core 事实链路；FileDiffCard 展示和 badlogic/pi-diff-review 式命令后续作为 UI/plugin/command 层扩展，不放进 P0 当前实现。

## OpenHanako-first 校准进度

### M0：OpenHanako compatibility audit

- `docs/design.md`
  - 已明确 OpenHanako-first 是 P0 runtime 主线。
  - 已把 myhanako 现有模块重新定位为 contract、mirror、projection、snapshot 和增强层。
- `docs/openhanako-compat-audit.md`
  - 已审计本地 `F:\openhanako-main` 的 `lib/pi-sdk`、`core/engine.js`、`core/session-coordinator.js`、`core/model-manager.js`、`core/plugin-manager.js`、`core/skill-manager.js` 和 `PLUGINS.md`。
  - 结论是复用调用顺序和边界，以 TypeScript 薄适配落地，不直接搬运 OpenHanako ESM JavaScript 文件。

### M1：Pi SDK dependency and adapter

- `package.json`
  - 已加入 `@mariozechner/pi-ai@0.70.5` 和 `@mariozechner/pi-coding-agent@0.70.2`，与本地 OpenHanako 版本边界一致。
  - 已加入 `test:pi-adapter`。
- `lib/pi-sdk/index.ts`
  - 已提供 Pi SDK import 统一入口。
  - `createAgentSession()` 会先规整 options，再安装 stream guard。
  - 已导出 `SessionManager`、`SettingsManager`、`DefaultResourceLoader`、`AuthStorage`、`ModelRegistry` 和 `createModelRegistry()`。
- `lib/pi-sdk/session-options.ts`
  - 已实现 Pi built-in tool name allowlist。
  - 已实现 `tools` 到 name allowlist、`customTools` 合并和无效工具提前失败。
- `lib/pi-sdk/stream-guard.ts`
  - 已建立稳定入口；当前只做幂等安装标记，完整异常事件恢复留到后续 stream projection hardening。
- `lib/test/pi-sdk-adapter.test.ts`
  - 覆盖 built-in tool names、normalization 和错误工具提前失败。
- `lib/test/pi-sdk-import.test.ts`
  - 覆盖稳定 adapter boundary 的真实 dependency import。
- `lib/test/pi-sdk-session-smoke.test.ts`
  - 覆盖不依赖全局 `pi` CLI 的真实 Pi SDK session create/subscribe/dispose smoke。
- `lib/test/import-discipline.test.ts`
  - 验证生产 TypeScript 代码不直接 import `@mariozechner/pi-*`。

### M2：Model and auth bridge

- `core/src/model-manager.ts`
  - 新增 `createPiModelBridge()`，从 `myhanakoHome` 派生 `auth.json` / `models.json`，并通过 Pi SDK factory 创建 `AuthStorage` 与 `ModelRegistry` bridge。
  - `ModelManager` 可接收注入的 Pi `AuthStorage` / `ModelRegistry`，避免自建第二套 provider runtime。
  - 新增 `refreshAvailableModelsFromRegistry()`，以 Pi registry 刷新的模型列表作为 `availableModels`，并把默认模型 rebind 到刷新后的模型对象。
  - 新增 `resolveModelCredentialStatus()`，通过 Pi registry 查询凭证状态，只返回 `ok`、`reason`、`hasApiKey`、`hasHeaders`，不向上层暴露 secret。
- `core/test/model-manager.test.ts`
  - 覆盖 Pi registry 模型刷新、默认模型 rebind、registry 模型 identity 校验、凭证状态脱敏和 bridge 工厂路径。

### M3：Engine and SessionCoordinator

- `core/src/session-coordinator.ts`
  - 新增最小 OpenHanako-style session lifecycle bridge。
  - `createSession()` 通过注入或默认 `lib/pi-sdk.createAgentSession()` 创建 session，并在新建 session 时传入 explicit model。
  - `recoverSession()` 使用 session manager open/fallback create，但不把 model 传给 `createAgentSession()`，保留 Pi SDK 从 session JSONL 恢复模型的语义。
  - 订阅 session stream events，转发到 event sink，并把 `session_created`、`session_recovered`、`session_disposed` 镜像到 `SessionEventLog`。
  - `disposeCurrentSession()` 会清理 subscription 并调用 session dispose。
- `core/src/engine.ts`
  - 新增最小 thin facade，只委托 `SessionCoordinator`，不持有第二套 runtime truth。
- `core/test/session-coordinator.test.ts`
  - 覆盖 create 传 model、recover 不传 model、stream event 转发和 dispose 清理。
- `core/test/engine.test.ts`
  - 覆盖 `Engine` 只作为 session lifecycle facade。

### M4：RuntimeResourceLoader 起步

- `core/src/runtime-resource-loader.ts`
  - 新增最小 `RuntimeResourceLoader`，负责构造 Pi `DefaultResourceLoader`、调用 `reload()`，并输出 session runtime 需要的 `resourceLoader`、`tools` 和 `customTools` snapshot。
  - 支持注入 `settingsManager`、`eventBus`、`extensionFactories`、`additionalExtensionPaths`、`additionalSkillPaths` 和 Pi-compatible skills。
  - 通过 `skillsOverride` 把 runtime skill contribution 与 diagnostics 合并进 `DefaultResourceLoader.getSkills()` 结果。
  - `toSessionRuntime()` 在 `reload()` 完成前会明确失败，避免 session 使用半初始化资源。
  - `toTransparencySnapshot()` 输出 reload 后的 tool/command/plugin/skill/path/diagnostic 快照，供 prompt/tool inspector 和后续 projection 使用。
- `core/src/runtime-contributions.ts`
  - 新增首版 contribution resolver，把 `ToolRegistry` definition snapshot 转成 Pi `customTools` wrapper，并输出 Pi SDK 0.68+ 需要的 `tools` name allowlist。
  - `CommandRegistry` 只输出 command snapshot，不暴露为 LLM-callable tool。
  - full-access plugin 的 `extensions` 声明会转成 `extensionPaths`，通过 `RuntimeResourceLoader` 的受控入口交给 `DefaultResourceLoader`。
  - `ToolDefinitionSnapshot.parameters` 可把真实 JSON schema 传给 Pi `customTools.parameters`；缺省时首版 wrapper 使用显式 JSON object fallback 参数 schema。完整权限包装留在 M4 后续。
  - Pi custom tool wrapper 会从调用上下文读取 `executionSubject` / `subject`，并透传给 `ToolRegistry` / `ExecutionBoundary` 做 per-call 权限判定。
- `shared/src/session-events.ts`
  - `ToolDefinitionSnapshot` 新增可选 `parameters`，用于记录 resolved tool 的真实参数 schema，同时保留 `schemaChecksum` 作为透明化和变更追踪字段。
- `core/src/skill-manager.ts`
  - 新增 `getSkillsForAgent()` / `resolveRuntimeSkills()`，对齐 OpenHanako 的 resource loader sync 入口。
  - 文件型 enabled skill 会输出 Pi-compatible resource skill；纯 prompt skill 不会伪装成文件型 skill，而是通过 diagnostics 标记缺少 `filePath` / `baseDir`。
- `core/src/session-runtime-resolver.ts`
  - 新增 session 创建前 runtime resolver：解析当前 tool/command/plugin/skill contributions，reload `RuntimeResourceLoader`，再把 `resourceLoader`、`tools` 和 `customTools` 交给 `SessionCoordinator`。
  - `SessionCoordinator` 支持静态 runtime 或异步 runtime provider，确保 session 创建时使用最新 resource snapshot。
- `core/test/runtime-resource-loader.test.ts`
  - 覆盖 `DefaultResourceLoader` 初始化参数、reload 调用、skills merge、session resource snapshot 和输入数组防外部突变。
- `core/test/runtime-contributions.test.ts`
  - 覆盖 registry tool -> Pi custom tool、slash command 不暴露为工具、full-access plugin extension path 和 ResourceLoader path/factory 传递。
- `core/test/session-runtime-resolver.test.ts`
  - 覆盖 resolver 在 session 创建前解析当前 contributions、reload resource loader，并输出 `SessionCoordinator` runtime。
- `core/test/session-coordinator.test.ts`
  - 补充 async runtime provider 覆盖，证明 `SessionCoordinator` 在调用 `createAgentSession()` 前解析 runtime。
- `core/test/skill-manager.test.ts`
  - 补充文件型 skill resource sync 覆盖，证明 prompt-only skill 不会进入 Pi resource loader。
- `package.json`
  - `npm test` 已纳入 `core/test/runtime-resource-loader.test.ts`、`core/test/runtime-contributions.test.ts` 和 `core/test/session-runtime-resolver.test.ts`。

### M5：Projection and transparency

- `core/src/session-stream-mirror.ts`
  - 新增 Pi/OpenHanako stream -> `SessionEventLog` mirror。
  - 覆盖 assistant text delta、assistant completion、tool requested/started/completed/failed 和 user message mirror。
  - mirror 按 session 串行写入，避免 delta/end 并发导致事件顺序错乱。
  - 默认 request/message id 已改为 per-session turn 序号，避免 tool-only turn 覆盖上一条 assistant transcript。
- `core/src/session-coordinator.ts`
  - `sendMessage()` 优先调用 Pi `AgentSession.sendUserMessage()`；streaming 状态下使用 `deliverAs: "followUp"`。
  - `interruptCurrentSession()` 调用 Pi `abort()`，并写入 `assistant_interrupted` mirror。
  - stream event 只转发和镜像，不让 event log 反向驱动 Pi session。
- `core/src/session-inspector.ts`
  - 新增 session inspector snapshot，默认从 event log 投影 transcript、FileDiffCard、TerminalCard、prompt layers、resolved tools、model requests 和 memory timeline。
  - `runtimeSnapshot` 仍只作为透明化补充，不成为 runtime truth。
- `shared/src/session-projection.ts`
  - transcript 投影过滤无内容且未完成的 assistant 占位流，避免 tool-only turn 在对话里显示为空消息。

### M6：Minimal server smoke

- `server/src/local-server.ts`
  - 新增最小本地 HTTP/WS server。
  - HTTP API 覆盖 `GET /health`、`GET /models`、`GET /events`、`GET /events/resume`、`GET /inspector`、`POST /sessions/create`、`POST /sessions/open`、`POST /sessions/send` 和 `POST /sessions/interrupt`。
  - WebSocket `/events` 负责 OpenHanako-style event projection，给事件补 `sessionPath`、`streamId` 和 `seq`。
- `server/src/session-stream-store.ts`
  - 参考 OpenHanako `session-stream-store.js`，实现 per-session stream state、ring buffer、resume、reset 和 truncated 标记。
  - server 只做投影和恢复语义，不保存第二套 session truth。

### M7：File, diff, terminal enhancement bridge and product smoke

- `core/src/enhancement-projection.ts`
  - 新增 FileDiffCard projection：`file_patch_proposed` / `file_write_committed` 投影为 proposed/committed card。
  - 新增 TerminalCard projection：OpenHanako-style `terminal_started`、`terminal_output`、`terminal_exited` 归一化为 terminal process events。
  - 终端输出保留 `rawText`，同时去 ANSI、CRLF/CR -> LF，并记录 `ansiMetadata.hadAnsi`。
- `server/test/local-server.test.ts`
  - 升级为完整 P0/M7 smoke：同一个本地 server 实例覆盖 session create、send、stream resume、assistant stream mirror、tool lifecycle、file patch/commit、terminal output、memory compile/inject、prompt/tool/model transparency、inspector projection、interrupt。
  - 该 smoke 捕获并推动修复了 tool-only turn 覆盖 assistant transcript 的投影问题。

## 验证命令

```powershell
npm run test:pi-adapter
npm test
git diff --check
```

最近验证结果：

- 2026-06-01 `npm run test:pi-adapter`：7/7 pass。
- 2026-06-01 `npm test`：91/91 pass。
- 2026-06-01 `git diff --check main...HEAD`：无 whitespace error。

## 远程维护状态

- 已推送远程分支：`feat/p0-event-log`
- PR：https://github.com/Tsungloong/myhanako/pull/3
- GitHub 连接器写 PR metadata 仍返回 `Resource not accessible by integration`；当前判断为 GitHub metadata scope 只读限制，`Pull requests: Read and write` 已确认勾选。
- 远程 Git / PR 维护在本地会话中反复遇到权限或审批超时。后续规则固定为：如果常规指令不可用，直接换已知可用路径；需要权限时立即请求用户提权；如果连接器、`gh` CLI 和 Git transport 都不可用，停止重试并汇报可行行动路径，由用户手动执行 Git/GitHub 操作。

## 阶段性审查记录

2026-06-01 代码审查 / PR 维护结论：

- PR #3 状态：open、非 draft、mergeable；无评论、无 review、无 unresolved review threads；GitHub 对当前 head 未返回 commit status/check 记录。
- P0 收尾状态：P0/M7 最小完整系统验证基线已具备，可以作为进入 P1 设计和桌面层开发的基础。
- 延后项 P1：实际 `/sessions/send` 链路目前由 `SessionCoordinator.sendMessage()` 写入 `user_message_created` 并调用 Pi `AgentSession.sendUserMessage()`，但没有在该入口主动向 server projection 发出 OpenHanako-style `session_status.isStreaming=true` / `session_user_message`。当前 P0 server smoke 通过手动 `server.publish()` 覆盖 stream projection；后续进入完整桌面/server/client 架构时，需要在真实 send 链路中统一补齐用户消息、stream begin、resume 语义和测试。
- 延后项 P2：`CommandRegistry` 遇到 alias 冲突时，冲突 alias 不会安装到 lookup 表，但仍可能留在 command snapshot 中。当前 P0 不依赖完整 command UI；后续做更完整 slash command / desktop command palette 时，需要改成拒绝冲突 alias 或从 snapshot 中剔除，并补回归测试。

## 下一步

- P0 已具备 M7 的最小完整系统验证基线；P1 阶段优先展开 Hanako-style desktop / server client 消费层，并在涉及真实 send projection 或 command UI 时处理上述延后项。

## 参考标注

这些参考只用于实现对齐，不替代 `docs/design.md` 的架构基准：

- OpenHanako `core/model-manager.js`：availableModels 唯一事实源、provider credentials、model registry/provider registry 分离。
- OpenHanako `shared/model-ref.js`：模型引用必须使用 `{id, provider}` 复合键，运行时不做裸 id fallback。
- OpenHanako `core/config-coordinator.js`：chat、utility、utility_large、vision 的角色配置组织方式。
- HanakoPro `README.md`：DeepSeek strict mode、prompt/tool 透明和 Windows 体验优化作为 P0/P2 方向参考。
- 继续保持 TDD：先写测试，再实现最小代码。
