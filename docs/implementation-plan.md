# myhanako PiAgent 原生架构实施计划

本计划以 [design.md](design.md) 为唯一架构基准。早期报告和未审核讨论只作为历史背景，不进入任务拆解和实现依据。

## 1. 总体原则

- P0 先落地可审计、可恢复、可扩展的原生内核，不急于做完整桌面产品。
- OpenHanako 的成熟分层是工程骨架参考，优先保持 `core/server/hub/lib/desktop/shared/plugins/skills` 的组织方式和 manager 思路。
- HanakoPro 的成熟体验是 P0 保底落地方向，尤其是可控记忆、prompt/tool 透明、Diff、终端日志、打断恢复、消息召回和 Windows 兼容。
- 兼容性优先。新抽象必须服务于已有成熟路径，不能因为内部模型更干净而丢掉 Hanako 已验证方案。
- skill/plugin 优先。只有 PiAgent 平台原生机制无法替代时，才考虑 full-access plugin 下的 `extensions/` 兼容入口。
- 安全边界先复用 Hanako 已验证思路，P0 预留 `ResourceAccessService` 和 `ExecutionBoundary`，复杂授权 UI 与完整审计平台后置。

## 2. 仓库阶段划分

### Phase A：工程基线

目标：建立可持续开发的本地仓库和协作流程。

交付：

- `docs/design.md` 作为唯一架构基准。
- `docs/implementation-plan.md` 作为实施计划入口。
- `docs/engineering-workflow.md` 作为 Git、分支、提交、PR 和发布流程入口。
- 初始化 Git 仓库、主分支和首个基线提交。
- 连接 GitHub 私有仓库并推送 `main` 与后续开发分支。

验收：

- 本地 `git status` 干净。
- `main` 上有可追溯的初始提交。
- GitHub 远程仓库为 private。
- README 能说明当前唯一资料入口和项目阶段。

### Phase B：P0 内核骨架

目标：搭出不依赖 Electron renderer 的可审计 Agent runtime 骨架。

建议任务顺序：

1. 建立 monorepo 或多包目录：`core`、`server`、`hub`、`lib`、`shared`、`plugins`、`skills`。
2. 定义 shared contracts：事件类型、API schema、plugin manifest、skill metadata、错误码、路径策略。
3. 实现 `SessionEventLog` append-only 存储和查询接口。
4. 实现 `PromptAssembler` 和 `PromptBundle` 快照结构。
5. 实现 `ModelManager` 与最小 `ModelAdapter`，先支持单主模型，保留 `chat/smallTool/largeTool/vision` 角色配置。
6. 实现 `ToolRegistry`、`CommandRegistry`、`PluginManager`、`SkillManager` 的最小可用骨架。
7. 实现 `MemoryService` 与 `MemoryCompiler` 的 P0 最小闭环。
8. 实现 `WorkspaceService`、`PatchService`、`DiffService` 的受控写入链路。
9. 实现 `TerminalService` 与 `TerminalNormalizer`，终端输出必须事件化。
10. 实现 `ResourceAccessService` 与 `ExecutionBoundary` 的初始接口和强制入口。
11. 提供 HTTP API 和 WebSocket event stream。

验收：

- 一次对话能产生可回溯的 prompt、memory、tools、model 和事件记录。
- 工具调用成功和失败都有事件。
- 文件修改必须经过 snapshot、patch、diff、commit。
- 终端 stdout/stderr 能按顺序事件化记录。
- skill/plugin 能加载、启用和禁用。
- 简陋客户端可通过 API/WebSocket 消费状态。

### Phase C：P1 桌面可用版

目标：参考 OpenHanako 的成熟结构，做可日常使用的基础桌面体验。

交付重点：

- Electron + React desktop shell。
- 会话列表和聊天窗口。
- WebSocket 事件流渲染。
- Tool group block。
- FileDiffCard。
- Terminal log card。
- 记忆列表、编辑、删除、pin、来源跳转。
- prompt layer 查看和编辑。
- plugin/skill 启用禁用。
- Windows 路径、编码和终端输出兼容。

验收：

- desktop 只消费 server/hub/core 事实投影，不直接读写文件或拼 prompt。
- HanakoPro 的 P0 保底数据接口能被桌面自然展示。
- Windows 下终端和路径行为稳定。

### Phase D：P2 HanakoPro 深化

目标：在 P0 稳定事实模型上补齐 HanakoPro 的产品增强。

候选任务：

- DeepSeek strict/tool stable mode。
- system prompt 透明、可查看和可恢复。
- 工具描述透明和可编辑，但不允许覆盖 schema 和执行权限。
- memory compiled preview 和注入记录视图。
- 消息召回、打断恢复、streaming interjection。
- 终端日志聚合与折叠。
- 文件编辑进度展示。
- Windows installer 和日志优化。

验收：

- P2 不推翻 P0 的事件、PromptBundle、记忆、文件和终端模型。
- 产品增强只增加投影和交互，不引入第二事实源。

### Phase E：P3 教学扩展

目标：把教学能力作为 skill/plugin 产品化，不污染核心 AgentRuntime。

候选任务：

- 教学 skill。
- `teaching` 类型记忆。
- 学习材料 workspace 组织。
- 代码解释模式。
- 实验终端日志讲解。
- 学习产物 diff。
- 复习计划。
- 课程或项目级 prompt profile。

验收：

- 教学功能能独立启用和禁用。
- 教学逻辑通过 skill/plugin 接入，不改核心 runtime 协议。

## 3. P0 里程碑

### M0：仓库和设计基线

- 完成 Git 初始化、首个提交和远程私有仓库。
- 锁定 `docs/design.md` 为唯一架构基准。
- 建立工程流程文档。

### M1：协议与事件

- 定义 `SessionEvent` 类型。
- 完成 append-only 事件存储。
- 完成事件查询、回放和基础测试。

### M2：Prompt 与模型

- 定义 `PromptLayerSnapshot` 和 `PromptBundle`。
- 完成 `PromptAssembler`。
- 完成最小 `ModelAdapter`。
- 写入 `prompt_layers_resolved`、`memory_injected`、`tools_resolved`、`model_request_started`。

### M3：plugin/skill/tool

- 完成 plugin manifest schema。
- 完成 restricted/full-access 初始语义。
- 完成 `ToolRegistry`、`CommandRegistry`、`PluginManager`、`SkillManager`。
- 支持内置 plugin 和本地 plugin。

### M4：记忆闭环

- 完成 `MemoryItem` 存储和状态。
- 完成 pinned/facts/today/week/longterm 编译。
- 完成注入记录和来源跳转数据。
- 支持用户修正、muted、archived。

### M5：文件和终端

- 完成 `WorkspaceService`、`PatchService`、`DiffService`。
- 完成 `TerminalService`、`TerminalNormalizer`。
- 文件和终端操作必须经过事件日志。

### M6：Server API

- 完成会话、事件、记忆、plugin、skill、文件、终端 API。
- 完成 WebSocket event stream。
- 使用简陋客户端做端到端验证。

## 4. 当前下一步

完成仓库初始化后，建议第一条开发分支从 `plan/p0-implementation` 或 `feat/p0-event-log` 开始。第一批代码不做桌面 UI，先实现 shared event contract 和 `SessionEventLog`，因为它是后续 prompt、memory、tool、terminal 和 diff 的共同事实基础。
