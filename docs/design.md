# myhanako OpenHanako-first PiAgent Architecture Design

日期：2026-05-29

项目名：`myhanako`

## 文档基准

本文档是后续架构讨论、计划拆解和实现工作的唯一架构基准。旧报告、早期草稿、未审核讨论、历史实施计划和进度记录只作为背景材料；如果它们与本文档冲突，以本文档为准。

本次校准后的优先级是：

1. OpenHanako 成熟产品基座优先复用。
2. Pi SDK / PiAgent 原生 runtime 和生态哲学必须真实落地。
3. HanakoPro 的记忆、prompt/tool 透明、Diff、终端、Windows 和模型体验作为 P0/P1 迭代优化方向。
4. `SessionEventLog`、`PromptBundle`、`DiffModel`、`MemoryCompiler` 等 myhanako 已有设计作为透明化、审计、UI 投影和可控增强层，不替代 OpenHanako / Pi SDK runtime。

一句话原则：

`OpenHanako 成熟产品基座优先复用 -> Pi SDK 原生哲学校准底层 -> HanakoPro 体验优化 -> myhanako 差异化演进`

## 背景

OpenHanako 已经在真实产品使用中证明了 Pi SDK + Hanako 桌面体验的组合价值。它的成功不只来自 UI，而是来自成熟的运行链路：

`Engine -> SessionCoordinator -> createAgentSession -> SessionManager -> DefaultResourceLoader -> Tool/Skill/Plugin/Model managers -> Desktop projection`

myhanako 前期已经实现了事件、prompt、model、plugin、skill、memory、diff、workspace 等 P0 骨架，但这些代码目前更像 clean-room 控制层实验，还没有把 OpenHanako 的 Pi SDK session runtime 作为真实主链。继续沿这个方向自研完整 runtime，会偏离当前目标：直接复用成熟 Hanako 产品基座，并在其上落实 Pi 的功能设计和设计哲学。

因此，P0 的首要任务从“自建可审计 Agent 内核”调整为“OpenHanako-first 兼容基座”，在可运行的 OpenHanako/Pi SDK 主链上逐步接入 myhanako 的透明化和可控增强。

## 目标

- 以 `F:\openhanako-main` 的成熟架构作为 P0 事实模板，优先复用其 `core/server/hub/lib/desktop/shared/plugins/skills` 分层和 manager 组织方式。
- 在 `myhanako` 仓库中建立 OpenHanako-compatible runtime spine，而不是依赖系统 PATH 中的 `pi` CLI。
- 通过项目内显式 Pi SDK 依赖和 `lib/pi-sdk` 适配层接入 `createAgentSession`、`SessionManager`、`DefaultResourceLoader`、`AuthStorage` 和 `ModelRegistry`。
- 保留 myhanako 已实现的 `SessionEventLog`、`MemoryService`、`DiffService`、`WorkspaceService` 等成果，但把它们放到审计、投影、增强和 UI 解释层。
- 继续吸收 HanakoPro 的成熟优化：可控记忆、prompt/tool 透明、Diff card、Terminal log、打断恢复、消息召回、DeepSeek strict/tool stable mode、Windows 体验。
- 保持 Pi 生态兼容：coding 和重工程能力尽量沿用 Pi SDK / Pi package / Pi tool/resource 机制，Hanako 插件层负责治理、产品化和可视化。

## 非目标

P0 不做这些事情：

- 不自研一个与 Pi SDK 并行的 LLM/tool loop。
- 不把 `AgentRuntime` 作为独立 runtime 主体；如果保留该命名，只能是 Pi session facade 或兼容外观。
- 不把 `SessionEventLog` 变成 Pi session history 的替代品。
- 不把泛用 `ExtensionHost` 放入主干。`extensions/` 只作为 OpenHanako full-access plugin 下的 Pi SDK 深度入口。
- 不要求 Pi package 重写成 Hanako plugin。
- 不一次性复刻完整 HanakoPro UI。
- 不在 P0 建完整插件市场、云同步、多 Agent 编排或复杂教学系统。

## 外部参考优先级

### P0 基准：OpenHanako

`F:\openhanako-main` 是 P0 的主要实现参考。重点复用方向：

- `lib/pi-sdk/index.js`：所有 Pi SDK import 统一入口。
- `core/engine.js`：薄 facade，集中注入 managers、resource loader 和 extension factories。
- `core/session-coordinator.js`：session 生命周期、`SessionManager`、`createAgentSession`、模型刷新和事件订阅。
- `core/model-manager.js`：`AuthStorage`、`ModelRegistry`、available models、provider credentials 和模型角色解析。
- `core/plugin-manager.js`：restricted/full-access 插件语义、贡献目录、runtime/routes/providers/extensions。
- `core/skill-manager.js`：skill 加载、同步到 Pi resource loader、session/project 绑定。
- `PLUGINS.md`：plugin package 结构、权限、marketplace、zip/sha256、安全边界。

### Runtime 哲学：Pi SDK / PiAgent

Pi 负责 agent runtime、session、tool/resource/package 生态和 coding workflow。myhanako 不应绕过 Pi SDK 重新发明模型调用、工具循环或 package 加载机制。

本机已经确认存在 PiAgent home：

`C:\Users\Tsung-long lee\.pi\agent`

该目录可作为原生配置和会话兼容方向，但工程接入应以项目内 Pi SDK 依赖为准，而不是依赖某个 shell 中是否能找到 `pi` 或 `piagent` 命令。

### 体验优化：HanakoPro

HanakoPro 是体验增强参考，尤其是：

- 可见、可控、可编辑、可追来源的记忆系统。
- prompt/tool/system prompt 透明。
- Diff card 和文件编辑反馈。
- 终端实时日志、折叠和 Windows 编码兼容。
- 模型角色、DeepSeek strict/tool stable mode。
- 打断恢复、消息召回、streaming interjection。

### 工作流参考：badlogic/pi-diff-review

`badlogic/pi-diff-review` 适合作为 Pi command / diff review workflow 参考。它不进入 P0 核心依赖，后续可作为 plugin、command 或 Pi package 能力落地。

## 核心架构判断

推荐路线是：

`OpenHanako-first 产品基座 + Pi SDK runtime spine + HanakoPro 增强层 + myhanako 审计/透明化能力`

关键区别：

- OpenHanako 是 P0 基座，不只是参考。
- Pi SDK 是实际 runtime，不是后置 adapter。
- HanakoPro 是体验优化目标，不是替代 OpenHanako 的新架构。
- myhanako 的新增模块必须贴合 OpenHanako 主链，不能反向要求 OpenHanako/Pi 迁就自建抽象。

已有 myhanako P0 代码不直接丢弃，但需要重新分层：

- 可复用：纯 contract、event projection、diff model、memory store、权限边界、测试思路。
- 需降级：`PromptAssembler`、`ModelAdapter`、`AgentRuntime` 类设计不得替代 Pi SDK session。
- 需重接：plugin/skill/tool/command 必须对齐 OpenHanako contribution 和 Pi `DefaultResourceLoader`。

## 当前仓库实现归位

截至 2026-05-29，`myhanako` 仓库已经推进到 P0/M5 文件受控链路起步。当前代码必须按下表重新归位；该表用于解释已有实现的架构角色，不替代 `docs/p0-progress.md` 的进度记录。

| 范围 | 已有文件 | 设计定位 | 后续动作 |
| --- | --- | --- | --- |
| shared contract | `shared/src/session-events.ts`、`shared/src/session-projection.ts`、`shared/src/prompt-bundle.ts`、`shared/src/model-ref.ts` | 保留为跨进程 contract、projection 和严格模型引用纪律。 | 将事件类型映射到 OpenHanako/Pi session stream，避免把当前 event contract 当成 session truth。 |
| event mirror | `core/src/session-event-log.ts` | 保留为 append-only 审计镜像和 UI 投影事件源。 | 接收 `SessionCoordinator` 转发的关键事件，不反向驱动 Pi SDK session。 |
| prompt/model snapshot | `core/src/prompt-assembler.ts`、`core/src/model-manager.ts` | 作为 prompt/tool/model 透明化快照和严格 provider/id 解析层。 | `PromptAssembler` 不再拥有 prompt 主链；`BasicModelAdapter` 不得演化成独立 provider runtime。 |
| tool/command/plugin/skill | `core/src/tool-registry.ts`、`core/src/command-registry.ts`、`core/src/plugin-manager.ts`、`core/src/skill-manager.ts` | 作为 contribution 管理、定义快照和 restricted/full-access 语义验证层。 | 重接到 OpenHanako contribution pipeline 和 Pi `DefaultResourceLoader/buildTools`。 |
| memory | `core/src/memory-service.ts`、`core/src/memory-compiler.ts` | 保留为用户可见记忆、来源追踪和编译投影。 | 注入必须走 Pi/OpenHanako-compatible prompt 或 resource 路径，并写入透明化快照。 |
| file/diff | `core/src/workspace-service.ts`、`core/src/diff-service.ts` | 保留为路径策略、snapshot、patch、checksum conflict check 和 UI-neutral `DiffModel`。 | 接到 Pi/OpenHanako 文件工具链外侧，作为 Diff card 和审计增强层。 |
| permission boundary | `core/src/resource-access-service.ts`、`core/src/execution-boundary.ts` | 保留为受限 service facade 和工具执行前检查点。 | 对齐 OpenHanako restricted/full-access plugin 边界，不单独发明授权体系。 |
| runtime spine | 尚未落地：`lib/pi-sdk`、`SessionCoordinator`、`server`、`hub`、`desktop` | P0 的主要缺口。 | 先完成 OpenHanako compatibility audit，再按 `lib/pi-sdk -> Engine/SessionCoordinator -> ResourceLoader -> projection` 顺序落地。 |

落地顺序约束：

1. 在新增 runtime 主链代码前，先审计 `F:\openhanako-main` 中可直接复用、需要薄适配和不应搬运的模块。
2. 先建立 `lib/pi-sdk` import 边界，再引入 `createAgentSession` 和 `SessionManager`。
3. 在 `DefaultResourceLoader` 对齐前，不扩大自建 tool/plugin/skill runtime 能力。
4. 当前 clean-room 模块只允许做 bugfix、测试补强和对齐改造；新功能必须服务 OpenHanako/Pi 主链接入。

## 系统架构

### 总体分层

```text
desktop / visual product layer
  -> server API / websocket projection
  -> core Engine facade
  -> OpenHanako-compatible managers
  -> lib/pi-sdk adapter
  -> Pi SDK createAgentSession / SessionManager / ResourceLoader
  -> Pi tools / skills / packages / providers

myhanako enhancement layer
  -> SessionEventLog mirror
  -> memory transparency
  -> prompt/tool/system prompt inspection
  -> DiffModel / Terminal projection
  -> audit and safety projection
```

### core

`core` 是业务编排层，但不自建 agent loop。它应对齐 OpenHanako 的 Engine facade 和 manager 注入模式。

核心职责：

- 初始化 `Engine`。
- 注入 `SessionCoordinator`、`ModelManager`、`SkillManager`、`PluginManager`、`ConfigCoordinator`、`AgentManager`。
- 创建并维护 Pi SDK `DefaultResourceLoader`。
- 汇总 plugin/skill/tool/provider contribution。
- 将 Pi session events 镜像到 myhanako 审计和 UI 投影层。

### lib

`lib` 放底层适配和可复用能力。P0 最重要的是 `lib/pi-sdk`。

必须包含：

- `lib/pi-sdk/index`
- `lib/pi-sdk/session-options`
- `lib/pi-sdk/stream-guard`
- `lib/tools`
- `lib/terminal`
- `lib/workspace`
- `lib/diff`
- `lib/security`

约束：

- 生产代码不得直接 import `@mariozechner/pi-*`，必须经过 `lib/pi-sdk`。
- Pi SDK 版本升级必须有适配层验证。
- OpenHanako 的 `patch-pi-sdk` 思路可以复用为导入纪律检查。

### server

`server` 是本地服务层，暴露 HTTP API 和 WebSocket event stream。它应复用 OpenHanako server 路由组织方式，承接 plugin routes，但不持有 runtime 事实源。

### hub

`hub` 承接后台任务和长任务状态，不参与 LLM/tool loop。它负责记忆编译、文件索引、Git 状态刷新、provider 健康检查、插件后台任务、长任务取消和进度广播。

### desktop

`desktop` 是 Electron + React 表现层。它按 Hanako/OpenHanako 思路做产品体验，不直接拼 prompt、不直接执行工具、不直接写文件。

职责包括会话列表、聊天窗口、Tool group block、FileDiffCard、Terminal log card、Memory panel、Prompt/tool/system prompt inspector、设置页和 Windows 桌面体验。

### shared

`shared` 放跨进程 contract，包括 API schema、event contract、model refs、plugin manifest、skill metadata、diff model、memory item、permission/resource contract 和 error codes。

## 模块设计

### Pi SDK Adapter

`lib/pi-sdk` 是 Pi SDK 唯一 import 边界。

职责：

- re-export `createAgentSession`、`SessionManager`、`SettingsManager`、`DefaultResourceLoader`、`AuthStorage`。
- normalize `createAgentSession` options。
- 包装 stream guard。
- 暴露模型注册和刷新 helper。
- 对 Pi SDK 版本做 runtime check。

禁止 core/server/plugin 直接 import `@mariozechner/pi-ai` 或 `@mariozechner/pi-coding-agent`。

### SessionCoordinator

`SessionCoordinator` 是 P0 runtime 主链的核心，不是 `SessionEventLog`。

职责：

- 创建、打开、切换和恢复 Pi SDK session。
- 通过 `SessionManager.create/open` 管理 session 文件。
- 构造 `createAgentSession` options：`cwd`、`sessionManager`、`settingsManager`、`authStorage`、`modelRegistry`、`resourceLoader`、`tools`、`customTools`、`model`、`thinkingLevel`。
- 订阅 Pi session stream events。
- 将事件转发给 server/desktop。
- 将关键事件镜像到 `SessionEventLog`。

### ModelManager

`ModelManager` 必须以 OpenHanako/Pi SDK 模型管理为准。

职责：

- 管理 `AuthStorage`。
- 创建和刷新 `ModelRegistry`。
- 维护 available models。
- 解析 provider credentials。
- 解析模型角色：`chat`、`utility`、`utility_large`、`vision`。
- 要求模型引用使用 `{ provider, id }` 或 `provider/id`。

约束：runtime 不允许裸 model id fallback。`ModelAdapter` 不应成为另一个 provider runtime。模型调用最终由 Pi SDK session 执行。

### ResourceLoader / Tool Pipeline

Pi `DefaultResourceLoader` 是 tools、skills、extensions、contexts、commands 等能力进入 session 的关键入口。

P0 对齐 OpenHanako：Engine 初始化 `DefaultResourceLoader`；PluginManager 和 SkillManager 汇总贡献；extension factories 只从 core/framework/full-access plugin 进入；buildTools 在 session 创建前完成；myhanako 的 tool transparency 读取最终 resolved tool definitions，而不是另建 tool truth source。

### PluginManager

PluginManager 优先复用 OpenHanako restricted/full-access 语义。

职责：读取 plugin manifest；注册 tools、commands、routes、providers、skills；兼容 `tools/`、`skills/`、`commands/`、`agents/`、`routes/`、`providers/`、`extensions/`；注入受限 service facade；管理启用、禁用、安装、升级和卸载状态；记录 plugin 行为到审计投影。

约束：restricted plugin 只允许静态贡献；full-access plugin 才允许 runtime、routes、providers、dynamic registration 和 `extensions/`；`extensions/` 不是泛用 P0 平台，只是 Pi SDK 深度集成入口。

### SkillManager

SkillManager 对齐 OpenHanako 和 Pi resource loader。它负责加载内置、用户级、项目级和插件贡献 skills，绑定 skill 到 agent/session/project/mode，处理 priority、enabled、conflict，将启用 skill 同步到 Pi resource loader，并为 prompt/tool inspector 提供可见元数据。

教学能力以后优先从 skill 开始，不改 runtime 主链。

### PiPackageManager

Pi package 兼容是 P1 重点，不抢 P0 runtime 校准。

职责：发现全局和项目级 `.pi/packages`；读取 Pi package metadata 和 settings；将 Pi package 的 tools、contexts、commands、MCP、shell tools、hooks、appendPrompt 等尽量原生传递给 Pi SDK；将 package 状态、来源、权限和风险投影到 Hanako UI。

设计原则：`Pi 原生生态优先，Hanako 插件层负责治理和产品化`。

不要求 Pi package 改写成 Hanako plugin。Hanako plugin 负责 UI、routes、settings、providers、本地产品能力和 full-access 深度集成。

### SessionEventLog

`SessionEventLog` 是 myhanako 的审计和 UI 投影层，不是 Pi session history 的替代品。

职责：镜像关键 session events；支撑消息、工具、终端、文件、记忆、prompt 的回放和审计；为桌面组件提供稳定 projection；记录 user recall、interrupt、recovery、memory injection、file diff 等增强事件。

原则：append-only；不反向驱动 Pi SDK session；不要求所有 Pi 内部事件都完整复制，只记录产品和审计需要的事件；UI 恢复优先读 OpenHanako/Pi session truth，再用 `SessionEventLog` 补充透明化投影。

### Prompt / Tool Transparency

myhanako 可以保留 `PromptBundle` 概念，但它必须是最终 prompt/tool resolution 的 snapshot，不是另一个 prompt runtime。

职责：展示 system prompt、developer overrides、skills、memory、tool definitions、model role；记录每次 request 的可解释快照；支撑 HanakoPro 风格 prompt/tool inspector。

约束：prompt 拼装主链优先跟随 OpenHanako/Pi SDK；透明化层不得修改 Pi SDK session contract；tool description 可以被用户覆盖，但 schema、required、executor、权限和路径策略不能被描述层改变。

### MemoryService

记忆系统学习 HanakoPro，但不能阻塞 OpenHanako runtime 基线落地。

P0/P1 最小闭环：

`用户可见记忆 -> 编译/选择 -> 注入到 Pi session prompt/resource path -> 记录注入快照 -> 来源跳转 -> 用户修正`

职责：维护 `MemoryItem`；支持 pinned、facts、today、week、longterm、project、teaching 层；支持 active、candidate、muted、archived；记录来源 session/event；给 prompt inspector 和 memory panel 提供 projection。

约束：记忆不能黑盒自动注入；candidate 默认不注入；每次注入必须可见、可查、可撤销或可修正。

### File / Patch / Diff

文件链路对齐 HanakoPro 体验，但 P0 不阻塞 runtime 校准。

推荐流程：

`Pi/OpenHanako tool reads workspace -> myhanako snapshot mirror -> patch proposal -> DiffModel -> FileDiffCard -> commit/deny`

职责：`WorkspaceService` 做路径策略和 snapshot；`PatchService` 生成受控 patch；`DiffService.renderDiffModel` 生成 UI-neutral diff；desktop 渲染 FileDiffCard。

约束：文件写入不能绕过路径策略；DiffModel 是展示模型，不是 runtime 主链；badlogic/pi-diff-review 可后续以 command/plugin/package 引入。

### Terminal

终端能力以 OpenHanako/Pi tool 为主链，myhanako 增强终端投影。它负责标准化 stdout/stderr 顺序，保留 rawText、normalizedText、ansi metadata，兼容 Windows CRLF、CR、ANSI，并渲染 Terminal log card。

## 数据流

### 对话

```text
desktop
  -> server send message API
  -> Engine / SessionCoordinator
  -> Pi SDK createAgentSession session
  -> Pi SDK stream events
  -> server websocket
  -> desktop projection
  -> SessionEventLog mirror
```

### 工具调用

```text
Pi SDK session
  -> resolved tools from DefaultResourceLoader/buildTools
  -> OpenHanako tool/plugin/service
  -> result stream
  -> server websocket
  -> SessionEventLog audit projection
```

### 记忆注入

```text
MemoryService
  -> MemoryCompiler / selection
  -> prompt/resource contribution compatible with Pi/OpenHanako path
  -> Prompt transparency snapshot
  -> memory_injected audit event
```

### Pi package

```text
.pi/packages or package source
  -> PiPackageManager discovery
  -> trust / permission projection
  -> native Pi SDK resource injection where possible
  -> Hanako UI status and audit projection
```

## State and Storage

Session runtime truth belongs to Pi SDK/OpenHanako: Pi session files、Pi settings/auth/model registry、OpenHanako agent/session directories、ResourceLoader state。

myhanako may persist projection state: event mirror、memory records、prompt/tool snapshots、diff snapshots、terminal normalized output、plugin/package install records、UI preferences。这些数据不得反向替代 Pi session truth。

后续需明确 `MYHANAKO_HOME` 与 PiAgent home 的关系：Pi 原生配置可以兼容读取 `C:\Users\Tsung-long lee\.pi\agent`；myhanako 自身状态建议独立放置，避免污染原生 PiAgent；如果共享 auth/settings，必须显式标注读写边界。

## API Design

P0 API 以 OpenHanako server 风格为准，myhanako 只补透明化和投影 API。

API 分类：

- session API：create/open/list/send/interrupt/recall。
- model API：providers/models/roles/credentials status。
- plugin API：list/install/enable/disable/metadata/routes。
- skill API：list/bind/unbind/metadata。
- memory API：list/create/update/archive/compile/injection records。
- file API：snapshot/propose patch/render diff/commit。
- terminal API：start/write/stop/output stream。
- inspector API：prompt snapshot/tool snapshot/system prompt/model role。
- event API：append-only projection query and websocket stream。

错误处理：runtime error 保留 Pi/OpenHanako 原始错误信息摘要；projection error 不应中断 Pi session；permission error 必须包含 subject、resource、permission、decision；file conflict 必须返回 old checksum、current checksum 和可恢复建议。

## Permissions and Security

P0 复用 OpenHanako 已验证安全边界：restricted/full-access plugin、受限 service facade、路径策略、插件贡献声明、`extensions/` 只允许 full-access、zip/package 安装防 zip-slip、symlink escape、sha256 校验和 downgrade 风险。

myhanako 增强：`ResourceAccessService` 可作为统一授权投影；`ExecutionBoundary` 可作为工具执行前检查点；prompt/tool description override 不得改变实际执行能力；Pi package full system access 风险必须在 UI 和 install record 中可见。

## Failure Modes

- Pi SDK 版本不兼容：`lib/pi-sdk` 启动时失败，提示需要升级适配层。
- Pi session 创建失败：保留原始错误摘要，写 projection failure event，不创建假 session。
- model credentials 缺失：ModelManager 返回 provider/id 和缺失 credential 状态，不猜 fallback。
- plugin load 失败：回滚已注册贡献，记录失败，不保留半加载状态。
- extension factory 失败：隔离到对应 full-access plugin，禁用该 extension contribution。
- memory compile 失败：不阻塞对话，只跳过本次注入并记录警告。
- event mirror 写入失败：不阻断 Pi session，但必须提示审计降级。
- file checksum conflict：拒绝写入，要求重新读取 snapshot。
- terminal normalization 失败：保留 raw output，标记 normalized output unavailable。

## Testing Strategy

P0 测试重点从“自建 runtime 单测”调整为“OpenHanako-compatible integration proof”。

必须覆盖：

- `lib/pi-sdk` import discipline。
- `createAgentSession` smoke test。
- `SessionCoordinator` create/open/recover。
- `ModelManager` provider/id strict refs 和 credentials resolution。
- `DefaultResourceLoader` tools/skills/extensions 注入。
- PluginManager restricted/full-access contribution rules。
- SkillManager enable/disable/sync。
- Pi session stream event to websocket projection。
- Pi session stream event to `SessionEventLog` mirror。
- prompt/tool transparency snapshot。
- memory injection visibility。
- file snapshot/patch/diff/commit chain。
- terminal output event ordering and Windows normalization。

P1/P2 增加 desktop render tests、FileDiffCard、Terminal card、Memory panel、prompt/tool inspector、Windows installer and packaged runtime smoke。

当前仓库验证基线：

- 文档或计划更新：至少运行 `git diff --check`，确认没有空白、编码或 Markdown diff 异常。
- 现有 TypeScript contract/service 改动：运行 `npm test`，覆盖 shared contract、event log、prompt、memory、workspace/diff、model、tool、command、plugin、skill 和权限边界测试。
- 引入 `lib/pi-sdk` 后：新增 import discipline test，证明生产代码只能通过 `lib/pi-sdk` 接触 Pi SDK package。
- 接入真实 session 后：新增 `createAgentSession` smoke test，证明项目内依赖可以创建、流式输出、调用工具并恢复 session。

## Iteration Plan

### P0：OpenHanako-first runtime baseline

目标：让 myhanako 先站到 OpenHanako 成熟 runtime 上。

范围：引入 Pi SDK dependencies；建立 `lib/pi-sdk` adapter；移植或复用 OpenHanako Engine / SessionCoordinator / ModelManager 主链；接入 `DefaultResourceLoader`；对齐 PluginManager / SkillManager / Tool pipeline；证明真实 Pi SDK session 可以创建、流式输出、调用工具、恢复 session；将 Pi/OpenHanako events 镜像到 `SessionEventLog`；保留已有 memory/diff/workspace/terminal 模块为增强层。

### P1：Hanako desktop usable baseline

目标：形成可日常使用的 Hanako-style 桌面体验。

范围：Electron + React shell；会话列表和聊天窗口；WebSocket 事件渲染；Tool group block；FileDiffCard；Terminal log card；Memory panel；prompt/tool/system prompt inspector；plugin/skill enable/disable；Pi package discovery first pass；Windows 路径、编码、终端兼容。

### P2：HanakoPro experience refinement

目标：把 HanakoPro 的成熟优化系统化接入。

范围：DeepSeek strict/tool stable mode；丰富模型角色配置；可编辑工具描述；memory compiled preview 和 injection records；message recall；interruption recovery；streaming interjection；终端日志聚合与折叠；文件编辑进度展示；Windows installer/logging。

### P3：Pi ecosystem and teaching extensions

目标：扩展 Pi package 生态和教学能力，但不污染 runtime。

范围：`PiPackageManager` 完整化；Pi package install/cache/trust records；badlogic/pi-diff-review style command；教学 skill；`teaching` memory；项目/课程 prompt profile；桌宠或可视化 companion 作为 desktop plugin 或 built-in panel。

## P0 Milestones

### M0：OpenHanako compatibility audit

- 标注 OpenHanako 可直接复用模块。
- 标注 myhanako 现有模块保留、降级、重接或删除策略。
- 更新实施计划，停止以自建 runtime 为主线。

### M1：Pi SDK adapter and dependencies

- 添加 Pi SDK dependencies。
- 建立 `lib/pi-sdk`。
- 添加 import discipline check。
- 通过版本和 basic import smoke。

### M2：Session runtime bridge

- 实现 OpenHanako-style `SessionCoordinator`。
- 使用 `SessionManager.create/open`。
- 调用 `createAgentSession`。
- 能完成一次真实 Pi SDK session smoke。

### M3：Model and auth bridge

- 接入 `AuthStorage` 和 `ModelRegistry`。
- 实现 provider/id strict refs。
- 支持 `chat`、`utility`、`utility_large`、`vision` 角色。
- 对齐本机 PiAgent auth/settings 的兼容读取策略。

### M4：Resource, plugin, skill pipeline

- 初始化 `DefaultResourceLoader`。
- 对齐 plugin restricted/full-access contribution。
- 对齐 SkillManager sync。
- buildTools 进入 Pi session options。

### M5：Projection and transparency

- Pi session events -> websocket。
- Pi session events -> `SessionEventLog` mirror。
- 生成 prompt/tool/model transparency snapshot。
- memory injection 可见。

### M6：File, diff, terminal enhancement

- 将已有 `WorkspaceService`、`DiffService`、terminal normalization 接到 OpenHanako/Pi 主链外侧。
- 保证增强层不绕过 runtime。

### M7：Minimal product smoke

- 简单 server/client 或 desktop shell 可完成对话。
- 能展示工具调用、Diff、终端、记忆和 prompt/tool 透明信息中的最小闭环。

## Hard Constraints

- OpenHanako-first 是 P0 优先级，不得再回到 clean-room runtime first。
- Pi SDK session 是 runtime truth。
- `lib/pi-sdk` 是 Pi SDK 唯一 import 边界。
- `AgentRuntime` 不能作为独立 LLM/tool loop。
- `SessionEventLog` 是 mirror/projection，不是 session truth。
- prompt/tool transparency 是 snapshot，不是另一个 prompt runtime。
- ModelManager 必须使用 provider/id strict refs。
- skill 负责行为模式，plugin 负责产品能力扩展，Pi package 负责 Pi 原生生态能力。
- extension 只保留在 full-access plugin / Pi SDK 深度集成域内。
- desktop 不能成为事实源。
- 记忆不能黑盒注入。
- 文件写入必须有路径策略、snapshot、diff 和 conflict check。
- 终端输出必须事件化。
- GitHub connector PR metadata 403 是悬置维护问题，不影响架构主线。

## Acceptance Criteria

P0 完成时必须能证明：

- myhanako 项目内通过 Pi SDK 创建真实 session。
- SessionCoordinator 使用 `SessionManager` 管理 session。
- ModelManager 能从 Pi/OpenHanako-compatible registry 解析模型和 provider credentials。
- ResourceLoader 能向 session 注入 tools/skills/plugin contributions。
- Pi session 流式事件能到达 server/desktop projection。
- `SessionEventLog` 能镜像关键事件，但不替代 session truth。
- prompt/tool/model/memory 透明化快照可查询。
- 文件 diff 和终端输出作为增强投影可展示。
- HanakoPro 的记忆、Diff、Terminal、prompt/tool 透明和 Windows 优化可以继续迭代，不需要推翻 OpenHanako 主链。

## 设计结论

myhanako 的正确方向不是重新发明一个更干净的 Hanako runtime，而是先复用 OpenHanako 这个已经验证的产品基座。Pi 的原生 runtime、package、tool/resource 和 coding workflow 必须成为底层事实；Hanako 的桌面、插件、记忆、Diff、Terminal 和可视化体验负责产品化；myhanako 的新增价值放在透明化、审计、可控记忆、Windows 体验和后续教学/可视化扩展上。

后续所有实现计划都应从这个顺序展开：

`先 OpenHanako 主链可运行，再接 myhanako 增强层，最后扩展 Pi 生态和 HanakoPro 体验。`
