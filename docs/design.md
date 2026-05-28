# myhanako PiAgent 原生架构设计

日期：2026-05-27

项目名：`myhanako`

## 文档基准

本文档是后续架构讨论、计划拆解和实现工作的唯一文字基准。未进入本文档的旧草稿、早期报告和零散设想不作为信息源，也不参与后续推理。

本文档只保留已经审核过的前后逻辑：以 OpenHanako 的成熟分层为工程参考，以 HanakoPro 的可控记忆、prompt/tool 透明、Diff、终端和 Windows 体验为保底落地方向，以 PiAgent 原生 runtime、事件、prompt 装配、plugin/skill 和安全边界作为长期可控内核。

## 目标

建立一个长期干净、可控、可扩展的 PiAgent 原生桌面 Agent 架构。第一阶段不把教学产品化放进主线，也不一次性复刻 HanakoPro 的全部体验；但 P0 的落地目标要以 HanakoPro 已验证的记忆、prompt、Diff、终端和 Windows 体验为保底方向，再在后续迭代中增强。

本设计以后续审核形成的设计共识为基准，并参考三个外部方向：

- OpenHanako：成熟工程骨架参考，重点是 `core/server/hub/lib/desktop/shared/plugins/skills` 的分层和 manager 组织方式。
- HanakoPro：体验优化参考，重点是记忆可见可控、prompt 和工具描述透明、Diff、终端日志、打断恢复、DeepSeek strict mode、Windows 体验。
- badlogic/pi-diff-review：Pi command 工作流参考，重点是用户主动命令、Git diff review、结构化反馈回填 prompt；不作为当前核心依赖。

## 核心判断

推荐路线是：

`PiAgent 原生内核 + OpenHanako 成熟分层 + HanakoPro 保底落地 + skill/plugin 优先生态`

OpenHanako 的成熟分层和 HanakoPro 的优化方向都应继续作为主要参考，不能因为引入 `SessionEventLog`、PromptBundle 或更严格的边界模型就丢掉 Hanako 已验证的产品路径。`SessionEventLog` 是内部事实模型，用来实现 Hanako 类似甚至更好的恢复、回放、审计和 UI 投影效果，不作为脱离 Hanako 路线的独立标签。

不推荐把当前阶段做成泛用 extension 平台。OpenHanako 和 HanakoPro 的成熟主线是 manager、plugin、skill、tool、command、routes、providers 和桌面组件。`extensions/` 可以按 OpenHanako 兼容方式保留，作为 full-access plugin 下的 Pi SDK 深度适配入口，是否开发按实际产品需要决定；泛用 `ExtensionHost` 不进入 P0 主干。

## 与 Hanako / OpenHanako / HanakoPro 的关系

### 继承 OpenHanako

实现方式上优先兼容 OpenHanako 的工程骨架：`core/server/hub/lib/desktop/shared/plugins/skills` 分层、manager 组织、server 独立进程、desktop 只做表现层、hub 承接后台任务、plugin/skill/tool/command/provider/routes 分工。这些是成熟方案，PiAgent 不应重新发明一套不兼容的抽象。

### 吸收 HanakoPro

P0 的实际可用目标应以 HanakoPro 的成熟优化作为保底：记忆可见可控、编译后注入、来源跳转、工具描述透明、system prompt 可查看、Diff card、终端实时日志、打断恢复、消息召回和 Windows 兼容。P0 不必一次性做完整 UI，但接口、事件和数据结构要让这些体验能自然落地。

### PiAgent 的差异

PiAgent 的核心差异不是做一个更大的平台，而是把 Hanako 成熟体验背后的事实源、边界和恢复路径整理得更干净：统一事件日志、统一 PromptBundle、受控文件写入、受控工具执行和可审计记忆注入。这些差异服务于长期可控，不应替代 Hanako 的成熟产品结构。

## 分层架构

### core

`core` 是业务编排层，不依赖 Electron renderer。

职责：

- 管理 Agent runtime。
- 协调 session、config、model、memory、plugin、skill。
- 触发工具循环。
- 调用 PromptAssembler。
- 写入 SessionEventLog。

主要模块：

- `AgentRuntime`
- `SessionCoordinator`
- `ConfigCoordinator`
- `ModelManager`
- `PluginManager`
- `SkillManager`
- `MemoryService`
- `ToolRegistry`
- `CommandRegistry`
- `ResourceAccessService`
- `ExecutionBoundary`

### server

`server` 是本地 Agent 服务进程，提供 HTTP API 和 WebSocket event stream。

职责：

- 会话 CRUD。
- 发送用户消息。
- 暴露配置、记忆、plugin、skill、文件、终端 API。
- 向 desktop、CLI 或未来教学 UI 推送统一事件。
- 承接 plugin routes。

### hub

`hub` 处理后台任务和事件调度。

职责：

- 记忆编译。
- 文件索引。
- Git 状态刷新。
- 插件后台任务。
- provider 健康检查。
- 长任务状态广播。
- 未来教学提醒、复习计划、桌宠提醒。

P0 的 hub 可以很薄，只需要任务注册、取消、状态查询和事件广播。

### lib

`lib` 放基础能力实现。

建议模块：

- `memory`
- `workspace`
- `terminal`
- `git`
- `patch`
- `diff`
- `sandbox`
- `security`
- `tools`
- `providers`
- `prompts`

### desktop

`desktop` 是 Electron + React 表现层，只投影事实，不持有事实源。

职责：

- 聊天窗口。
- 会话列表。
- 设置页。
- 记忆面板。
- Diff card。
- Terminal log card。
- Tool group block。
- 桌宠和本地窗口体验。

桌面端通过 HTTP 和 WebSocket 访问 server，不直接读写文件、不直接拼 prompt、不直接执行工具。

### shared

`shared` 放跨进程契约。

内容：

- 事件类型。
- API schema。
- plugin manifest 类型。
- skill metadata 类型。
- 错误码。
- 路径策略。
- model refs。
- 配置 schema。

## P0 核心内核

P0 的目标不是完整桌面产品，而是可审计、可恢复、可扩展的 PiAgent 原生内核。

必须包含：

- 单 Agent 对话。
- 流式输出。
- 工具调用循环。
- 分层 prompt 装配。
- 统一事件日志。
- 模型适配层。
- 内置 plugin 和 skill 加载。
- HanakoPro 式可见编译记忆：用户可看、可改、可追来源、可查注入记录。
- 文件快照和受控写入。
- 终端执行和实时输出事件。
- 基础安全边界：路径策略、受限 service facade、工具权限校验和执行入口约束。
- HanakoPro 保底体验的数据接口：prompt/tool 透明、FileDiffCard 数据、终端日志、打断恢复和消息召回事件。
- HTTP API。
- WebSocket event stream。

P0 可以使用简陋客户端验证，不要求完整 Electron 体验。

## SessionEventLog

P0 的重要事实源是 `SessionEventLog`。所有关键行为先变成事件，再由 UI 投影。它的目标是支撑 Hanako 类似甚至更好的恢复、回放、审计和消息/工具/终端展示，而不是替代 Hanako 的成熟会话模型。

核心事件类型：

- `user_message_created`
- `prompt_layers_resolved`
- `assistant_stream_started`
- `assistant_delta_received`
- `assistant_message_completed`
- `tool_call_requested`
- `tool_call_started`
- `tool_stdout_received`
- `tool_call_completed`
- `tool_call_failed`
- `file_snapshot_read`
- `file_patch_proposed`
- `file_write_committed`
- `terminal_process_started`
- `terminal_output_received`
- `terminal_process_exited`
- `memory_candidate_detected`
- `memory_item_created`
- `memory_item_updated`
- `memory_item_deleted`
- `memory_compiled`
- `memory_injected`
- `command_invoked`
- `prompt_draft_created`
- `assistant_interrupted`
- `message_recalled`
- `session_recovered`

原则：

- 事件 append-only。
- 用户召回或删除消息时，不物理删除历史事件，而是写入修正事件。
- 长流程先写 started，再写 completed 或 failed。
- 恢复逻辑基于事件，不基于 UI 状态。

## PromptAssembler

Agent 的核心是上下文装配。Prompt 必须由 `PromptAssembler` 统一生成，不允许散落拼字符串。

Prompt 层：

- `runtime_contract`：运行协议、安全边界、工具调用约束。
- `identity`：Agent 身份和表达风格。
- `user_profile`：用户长期偏好，来自可控记忆。
- `workspace_context`：当前项目、路径、平台、环境。
- `skill_context`：启用的 skill 或模式。
- `memory_context`：MemoryCompiler 输出。
- `tool_policy`：工具可用性、风险提示、调用规则。
- `session_context`：当前会话摘要和最新消息。
- `developer_overrides`：高级覆盖项，必须可见、可恢复。

每层应记录：

- `id`
- `source`
- `priority`
- `enabled`
- `editable`
- `tokenBudget`
- `version`
- `checksum`

每次模型调用生成 `PromptBundle`：

```ts
type PromptBundle = {
  requestId: string
  model: string
  modelRole: "chat" | "smallTool" | "largeTool" | "vision"
  messages: unknown[]
  toolDefinitions: unknown[]
  layers: PromptLayerSnapshot[]
  injectedMemoryIds: string[]
  enabledSkillIds: string[]
  enabledToolIds: string[]
  tokenEstimate: number
  warnings: string[]
}
```

同时写入：

- `prompt_layers_resolved`
- `memory_injected`
- `tools_resolved`
- `model_request_started`

## 模型适配

模型差异放在 `ModelAdapter`，不污染 AgentRuntime。

职责：

- 把统一 PromptBundle 转成目标模型 API 格式。
- 处理工具 schema 兼容。
- 应用 DeepSeek strict mode 等模型特定策略。
- 处理流式输出。
- 处理 tool call delta。
- 标准化错误。

P0 可以先把 `chat`、`smallTool`、`largeTool`、`vision` 等模型角色映射到同一个主模型，只实现最简单状态；但配置结构必须预留角色选择，后续向 OpenHanako/HanakoPro 的丰富模型角色演进时不需要推翻 ModelManager。DeepSeek strict/tool stable mode 也作为模型策略预留。

## 工具描述透明化

HanakoPro 的工具描述自定义应进入核心，但边界必须收紧。

允许用户或配置覆盖：

- tool description。
- parameter description。
- 示例说明。
- 模型特定提示。

不允许描述层覆盖：

- 参数类型。
- required 字段。
- 工具执行函数。
- 路径权限。
- shell 风险策略。
- 文件写入策略。

描述影响模型行为，schema 和执行能力影响系统安全。这两者必须分开。

## 记忆系统

记忆不是后台缓存，而是会进入 prompt 的可控事实。

HanakoPro 的成熟方案是 P0 的保底落地目标：先做到可见的编译记忆、来源跳转、用户可编辑、注入记录可查和 prompt 注入透明。完整条目生命周期可以作为后续增强，但 P0 不应因为设计过重而拖慢可用落地。

P0 最小闭环：

`用户可见记忆 -> pinned/facts/today/week/longterm 编译 -> Prompt 注入 -> memory_injected 记录 -> 来源跳转 -> 用户修正`

目标生命周期：

`候选发现 -> 用户确认或规则确认 -> 结构化存储 -> 周期编译 -> Prompt 注入 -> 来源追踪 -> 用户修正`

`MemoryItem` 字段：

- `id`
- `type`：`fact`、`preference`、`project`、`skill`、`teaching`、`temporary`
- `content`
- `sourceSessionId`
- `sourceEventIds`
- `confidence`
- `status`：`candidate`、`active`、`muted`、`archived`
- `visibility`
- `scope`
- `createdAt`
- `updatedAt`
- `lastInjectedAt`
- `expiresAt`
- `tags`

编译层：

- `pinned`
- `facts`
- `today`
- `week`
- `longterm`
- `project`
- `teaching`

注入规则：

- pinned 优先。
- 当前 project/workspace scope 优先。
- muted、archived、过期记忆不注入。
- candidate 默认只展示，不注入。
- 冲突记忆标记为 conflict，等待用户处理。
- 每次注入写入 `memory_injected`，记录 memory ids。

桌面记忆面板只作为 `MemoryService` 的视图，不能直接拼 prompt。

## Skill / Plugin 优先策略

功能归属规则：

- 改 prompt、行为模式、教学语气、审阅策略：做成 skill。
- 增加文件、Git、终端、记忆、模型 provider、UI 面板：做成 plugin。
- 需要模型自主调用：plugin 注册 tool。
- 需要用户主动输入 `/xxx`：plugin 注册 command。
- 只是桌面显示优化：做 built-in UI component 或 plugin UI hook。
- 只有 PiAgent 平台原生机制不可替代：再考虑 Pi platform adapter。

P0 主干：

- `PluginManager`
- `SkillManager`
- `ToolRegistry`
- `CommandRegistry`

不把泛用 `ExtensionHost` 放进 P0。`extensions/` 目录可以按 OpenHanako 的插件兼容策略保留，但默认不作为泛用生态入口；只有 PiAgent/Pi SDK 原生机制无法用 skill、plugin、tool、command 或 provider 解决时，才酌情开发。

## PluginManager

职责：

- 读取 plugin manifest。
- 注册 tools、commands、routes、providers、skills。
- 兼容 OpenHanako 风格贡献目录：`tools/`、`skills/`、`commands/`、`agents/`、`routes/`、`providers/`、`extensions/` 和可选 runtime 入口。
- 校验权限声明。
- 注入受限 service facade。
- 管理启用和禁用状态。
- 把 plugin 行为写入 event log。
- 给 server 和 desktop 暴露 plugin metadata。

第一阶段只做内置 plugin 和本地 plugin，不做完整插件市场。

兼容性优先：优先采用 OpenHanako 已经验证的 restricted/full-access 插件语义。restricted plugin 只贡献静态 tools、skills、commands、agents 和配置；full-access plugin 才允许 runtime 入口、routes、providers、动态注册和 `extensions/`。

权限语义先保持粗粒度：

- `workspace:read`
- `workspace:write`
- `terminal:run`
- `git:read`
- `memory:read`
- `memory:write`
- `prompt-draft:create`
- `tool:register`
- `command:register`
- `network:access`

## SkillManager

职责：

- 加载内置 skills。
- 绑定 skill 到 session、project 或 mode。
- 向 PromptAssembler 提供 skill context。
- 管理 priority、enabled、conflict。
- 支持用户自定义或项目级 skill。
- 兼容常见 skill 路径，例如 `.claude/skills`、`.codex/skills`、`.openclaw/skills`、`.pi/agent/skills`、`.agents/skills`。

教学能力以后应优先从 skill 开始，不改 AgentRuntime。

## 文件、Patch 与 Diff

文件编辑必须经过受控流程：

`读取快照 -> 生成 patch -> 展示 diff -> 提交写入`

核心服务和事件：

- `WorkspaceService.readSnapshot(path)` 产生 `file_snapshot_read`。
- `PatchService.proposePatch(...)` 产生 `file_patch_proposed`。
- `DiffService.renderDiffModel(...)` 生成展示模型。
- `WorkspaceService.commitPatch(patchId)` 产生 `file_write_committed`。

三层模型：

- `PatchModel`：核心事实，表示文件如何变化。
- `DiffModel`：展示模型，包含 hunks、行号、语言、old/new。
- `DiffView`：UI 表现，例如 inline card、side-by-side、review window。

P0 稳定 `PatchModel` 和 `DiffModel`，并以 HanakoPro 式 FileDiffCard 作为最先落地的展示形态。Monaco 独立 review window 和 badlogic/pi-diff-review 式 `/diff-review` 命令更适合作为后续 plugin/command 扩展，不放进 P0 主线。

typewriter 编辑效果属于 UI 进度展示，不是文件一致性来源。

## 终端

终端输出必须事件化：

`terminal_process_started -> terminal_output_received* -> terminal_process_exited`

`terminal_output_received` 字段：

- `processId`
- `stream`
- `chunk`
- `sequence`
- `timestamp`
- `normalizedText`
- `rawText`
- `ansiMetadata`

Windows CRLF、CR、ANSI 处理放入 `TerminalNormalizer`，不放在 React 组件里。

## 安全边界

P0 先复用 Hanako 已验证的安全边界思路：受限 service facade、路径策略、插件 restricted/full-access 区分、工具执行入口收束和桌面层不直接触达系统资源。这里先预留 `ResourceAccessService` 与 `ExecutionBoundary` 两个接口，不急于做复杂策略 UI、细粒度授权编辑或完整安全审计平台。

最小边界：

- 文件访问必须经过 `WorkspaceService` 和路径策略。
- 终端执行必须经过 `TerminalService` 和执行入口约束。
- plugin runtime 只能拿到受限 facade。
- full-access plugin 必须显式声明，`extensions/` 只能出现在 full-access 能力域内。
- 安全策略由 core/server 执行，desktop 只展示和请求。

## Server / Desktop 通信

一次对话：

`desktop -> server API -> core AgentRuntime -> event log -> websocket -> desktop projection`

工具调用：

`AgentRuntime -> ToolRegistry -> plugin/service -> event log -> websocket -> desktop`

记忆编译：

`hub scheduled task -> MemoryCompiler -> memory_compiled event -> PromptAssembler 下次读取`

文件修改：

`tool/plugin -> WorkspaceService -> PatchService -> file_patch_proposed -> desktop DiffCard -> commit/deny`

WebSocket 传统一 `SessionEvent`，不只传聊天 token。

## 本地数据目录

建议数据根目录为 `PIAGENT_HOME`。

目录：

- `PIAGENT_HOME/config`
- `PIAGENT_HOME/sessions`
- `PIAGENT_HOME/events`
- `PIAGENT_HOME/memory`
- `PIAGENT_HOME/plugins`
- `PIAGENT_HOME/skills`
- `PIAGENT_HOME/cache`
- `PIAGENT_HOME/logs`
- `PIAGENT_HOME/.pi`

workspace 保存用户项目文件，不保存 Agent 全局状态。

## 路线图

### P0：PiAgent 原生可控内核

目标：可审计的本地 Agent runtime。

范围：

- core/server/shared/lib 基础目录与 manager 骨架。
- AgentRuntime。
- SessionEventLog。
- PromptAssembler。
- ModelAdapter。
- ToolRegistry。
- PluginManager。
- SkillManager。
- MemoryService。
- MemoryCompiler。
- WorkspaceService。
- TerminalService。
- ResourceAccessService。
- ExecutionBoundary。
- ConfigStore。
- HTTP API + WebSocket event stream。

### P1：OpenHanako-like 桌面可用版

目标：可日常使用的基础 Agent Desktop。

范围：

- Electron + React desktop shell。
- 会话列表。
- 聊天窗口。
- 设置页。
- WebSocket 消息流渲染。
- Tool group block。
- 文件读写工具。
- 基础 terminal card。
- 插件和 skill 启用禁用。
- 记忆列表、编辑、删除、pin、来源跳转。
- prompt layer 查看和编辑。
- Windows 路径、编码、终端输出兼容。

### P2：HanakoPro 深化体验

目标：在 P0 保底落地基础上，深化 HanakoPro 的产品增强。

范围：

- DeepSeek strict/tool stable mode。
- 文件编辑 typewriter 展示。
- 终端实时日志聚合与折叠。
- 消息召回。
- streaming interjection。
- interruption recovery。
- 稳定 message block 渲染。
- 工具描述透明和可编辑。
- system prompt 透明和可恢复。
- memory compiled preview。
- memory 注入记录展示。
- 桌宠作为 desktop plugin 或 built-in panel。
- Windows installer 和日志优化。

### P3：教学场景扩展

目标：把教学作为 skill/plugin 产品化，不改内核。

范围：

- 教学 skill。
- `teaching` 类型记忆。
- 学习材料 workspace 组织。
- 代码解释模式。
- 实验终端日志讲解。
- 学习产物 diff。
- 复习计划。
- 课程或项目级 prompt profile。
- 必要时再评估多 Agent。

## 非目标

P0 不做：

- 完整插件市场。
- 泛用 ExtensionHost，但保留 full-access plugin 的 `extensions/` 兼容入口。
- Monaco 独立 review window。
- 多 Agent 编排。
- 复杂教学系统。
- 云同步。
- 远程插件安装。
- 复杂权限 UI。
- 自动长期记忆黑盒化。
- 桌宠深度交互。

## 不可违反的约束

- desktop 不能成为事实源头。
- 记忆不能黑盒注入。
- tool description 可以覆盖，tool schema 和执行权限不能被描述层改变。
- 文件写入必须经过 snapshot、patch、diff、commit。
- 终端输出必须事件化。
- prompt 装配必须生成可审计 PromptBundle。
- plugin 必须通过受限 service facade 访问能力。
- 文件、终端、provider、plugin runtime 和未来 MCP/外部工具必须经过 `ResourceAccessService` 或 `ExecutionBoundary` 预留入口，不允许绕开统一边界直接触达系统资源。
- skill 负责行为模式，plugin 负责能力扩展。
- extension 不进 P0 主干，但兼容保留。
- 教学功能不进内核。

## 测试策略

P0 测试重点是协议和恢复能力：

- 事件 append 顺序。
- 工具调用成功和失败。
- 流式输出中断恢复。
- PromptBundle 分层和注入记录。
- 记忆创建、编辑、删除、编译、注入。
- 文件快照 old/new 一致性。
- patch 冲突处理。
- terminal stdout/stderr 顺序和编码标准化。
- plugin 权限和 service facade。
- skill 启用禁用和 prompt 注入。
- server HTTP API。
- WebSocket event stream。

P1/P2 增加桌面渲染、交互和 Windows 兼容测试。

## 风险

- P0 过薄会导致后续 HanakoPro 体验变成 UI 补丁。
- P0 过重会拖成平台工程，阻碍可用桌面落地。
- 过早把安全边界工程化得太重会拖慢落地；P0 先采用 Hanako 已验证的边界方案和受限入口，复杂审计 UI、细粒度授权和策略编辑后置。
- 记忆系统如果默认自动注入，会损害用户控制。
- tool description 覆盖如果越过 schema，会引入安全风险。
- 终端和文件操作如果绕过事件日志，会破坏恢复和审计。
- 过早引入 extension 平台会偏离 OpenHanako/HanakoPro 的成熟生态。

## 验收标准

P0 完成时必须能证明：

- 一次对话的 prompt、memory、tools、model、事件都可回溯。
- 工具调用成功和失败可审计。
- 文件修改能展示 old/new diff，写入有事件记录。
- 终端输出能实时流式记录并回放。
- 记忆条目能看到来源、状态、注入记录。
- skill/plugin 可以加载、启用、禁用。
- desktop 或简单客户端只通过 API/WebSocket 消费状态。
- P1/P2 的 HanakoPro 优化可以自然接入，不需要推翻 P0。

## 设计结论

长期干净可控的 PiAgent 原生架构，不是先做完整桌面，也不是先做通用扩展平台，而是先稳定：

- 事件日志。
- Prompt 装配。
- 可控记忆。
- plugin/skill 生态。
- 文件和终端事实模型。
- server/hub/desktop 进程边界。

在这个基础上，OpenHanako 的成熟结构可以被复用，HanakoPro 的体验优化可以逐步吸收，教学场景可以作为 P3 的 skill/plugin 扩展进入，而不污染核心 AgentRuntime。
