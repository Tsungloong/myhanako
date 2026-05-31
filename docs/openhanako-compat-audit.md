# OpenHanako Compatibility Audit for P0

日期：2026-05-29

本文档是 P0/M0 交付物，用于把 `F:\openhanako-main` 的已验证实现拆成可复用、需薄适配、只借鉴和不搬运四类。它服务于 [design.md](design.md) 和 [implementation-plan.md](implementation-plan.md)，不替代两者。

## 总结结论

- P0 可以复用 OpenHanako 的 runtime 组织方式，但不应整块搬运完整产品功能。
- 直接复用的不是 UI 或所有 manager 细节，而是 `lib/pi-sdk -> Engine -> SessionCoordinator -> ModelManager -> DefaultResourceLoader -> PluginManager/SkillManager` 的调用顺序。
- myhanako 当前已有模块应继续保留为 contract、mirror、projection、snapshot 和增强层。
- 第一批代码已经建立 `lib/pi-sdk` import 边界，并落地最小 `Engine` 和 `SessionCoordinator`。
- 迭代控制为 3 轮：证据同步、实施契约收敛、验证后进入 M2/M3 开发；M1/M2/M3 已经落地，M4 已补 `RuntimeResourceLoader`、首版 `runtime-contributions` 输出契约、tool parameter schema passthrough、SkillManager resource sync、resolved transparency snapshot、per-call execution subject 权限透传和 session runtime wiring，下一步进入 projection/server。

## 审计矩阵

| OpenHanako 模块 | 本地证据 | 复用策略 | myhanako 动作 |
| --- | --- | --- | --- |
| `lib/pi-sdk/index.js` | 统一 re-export `createAgentSession`、`SessionManager`、`DefaultResourceLoader`、`AuthStorage`，并包装 `createModelRegistry` 和 stream guard。 | 薄适配。 | 新建 `lib/pi-sdk/index.ts`、`session-options.ts`、`stream-guard.ts`，只暴露稳定 runtime 入口。 |
| `lib/pi-sdk/session-options.js` | 定义 Pi built-in tool names，并规整 tools/customTools。 | 薄适配。 | M1 先实现最小 options normalize；不要一次搬运所有工具兼容分支。 |
| `core/engine.js` | `HanaEngine` 初始化 `ModelManager`、`SessionCoordinator`、`SkillManager`、`PluginManager`、`DefaultResourceLoader`、event bus 和 execution boundary。 | 只借鉴结构，避免整块搬运。 | 新建最小 `core/src/engine.ts`，只纳入 session/model/resource/plugin/skill/event mirror 需要的依赖。 |
| `core/session-coordinator.js` | 通过 `SessionManager.create`、`createAgentSession`、`session.subscribe` 管理 create/open/recover/isolated/dispose。 | 薄适配核心路径。 | 已新建 `core/src/session-coordinator.ts`，首版覆盖 create/recover/dispose 和 stream projection；send/interrupt 放到 server/projection 阶段。 |
| `core/model-manager.js` | 管理 `AuthStorage`、`ModelRegistry`、available models、provider credentials；运行时拒绝裸 model id fallback。 | 薄适配。 | 改造现有 `core/src/model-manager.ts`，保留 strict ref 测试，补 Pi SDK registry 和 credential bridge。 |
| `core/plugin-manager.js` | 扫描 manifest；restricted 默认；full-access 才加载 routes/providers/extensions/lifecycle；提供 tools/commands/providers/extensions 查询。 | 借鉴权限和 contribution 语义。 | 现有 `PluginManager` 不再作为独立执行平台；M4 输出 contribution 给 resource loader 和 transparency snapshot。 |
| `core/skill-manager.js` | 从 `DefaultResourceLoader.getSkills()` 初始化 skills，按 agent enabled 状态过滤，支持 plugin/workspace/external skill。 | 薄适配最小路径。 | 现有 `SkillManager` 接入 resource loader sync；watcher、外部目录热加载可后置。 |
| `PLUGINS.md` | 插件目录含 `tools/`、`skills/`、`commands/`、`routes/`、`providers/`、`extensions/`；restricted 和 full-access 权限边界明确。 | 借鉴协议和权限模型。 | P0 只实现 manifest/contribution/权限边界；marketplace、dev plugin、诊断页面后置。 |

## 关键 OpenHanako 证据

### Pi SDK adapter

OpenHanako 的 `lib/pi-sdk/index.js` 把 Pi SDK import 统一收口，并额外做三件事：

- `createAgentSession(options)` 会补齐 `agentDir`，调用 `normalizeCreateAgentSessionOptions()`，然后安装 `installAssistantStreamGuard()`。
- `createModelRegistry(authStorage, modelsJsonPath)` 包装 `ModelRegistry.create()`，避免业务代码依赖 SDK 构造细节。
- `refreshSessionModelFromRegistry(session)` 作为版本兼容桥，避免 provider 配置刷新后 active session 继续用旧 model object。

M1 只实现这三个方向中的前两个和最小 stream guard；`refreshSessionModelFromRegistry()` 可在后续需要刷新 active session model object 时加入。

### session options

OpenHanako 的 `session-options.js` 记录了 Pi SDK 0.68+ 的工具契约变化：`tools` 从工具对象数组转为 name allowlist，原工具对象要转换进 `customTools`。myhanako M1 必须复制这个兼容思想，否则后续 `buildTools` 接入会在 SDK 0.70.x 上出现工具不可见或重复注册。

P0 最小规则：

- `PI_BUILTIN_TOOL_NAMES` 固定为 `read`、`write`、`edit`、`bash`、`grep`、`find`、`ls`。
- `normalizeCreateAgentSessionOptions()` 在 SDK name-allowlist 版本下把 `tools: Tool[]` 转成 `tools: string[]`，并把转换后的 tool definitions 合并到 `customTools`。
- 对无 `name` 或无 `execute` 的 tool 直接抛错，失败应发生在创建 session 前。

### stream guard

OpenHanako 的 `stream-guard.js` 处理空 name tool call，把无法执行的 toolcall 片段恢复成文本，避免 SDK/provider 事件形态异常打穿上层。myhanako M1 不需要完整复制所有恢复逻辑，但必须建立 `installAssistantStreamGuard(session)` 的稳定入口；完整异常事件恢复放到后续 stream projection hardening。

### ResourceLoader 初始化

OpenHanako 在 engine init 中先构建 `extensionFactories`，再创建 `DefaultResourceLoader`，调用 `reload()`，随后让 `SkillManager.init(resourceLoader, agents, hiddenSkills)` 从 resource loader 获取 skills，并覆盖 `getSystemPrompt()` / `getSkills()` 作为当前 agent 的运行时视图。

myhanako M4 应保留这个顺序：

1. 创建 extension factory 数组。
2. `new DefaultResourceLoader(options)`。
3. `await resourceLoader.reload()`。
4. `SkillManager` 从 `resourceLoader.getSkills()` 同步 skill 视图。
5. `resourceLoader.getSystemPrompt` 和 `resourceLoader.getSkills` 变成 session/agent aware wrapper。

当前首版落地已经覆盖 session 创建前的最小 wiring：`RuntimeResourceLoader` 负责 `DefaultResourceLoader` 初始化和 reload，并通过 `toTransparencySnapshot()` 输出 resolved tool/command/plugin/skill/path/diagnostic 快照；`runtime-contributions` 负责把 registry/plugin contribution 解析为 `tools` name allowlist、registry-backed `customTools`、command snapshot、extension paths、skill paths、真实 tool parameter schema 和 per-call execution subject 权限透传；`SkillManager` 负责把文件型 enabled skills 同步为 Pi-compatible resource skills；`SessionRuntimeResolver` 负责在 session 创建前组装 runtime 并交给 `SessionCoordinator`。完整 `buildTools` 对齐和 projection/server 仍是后续任务。

### SessionCoordinator 创建 session

OpenHanako `SessionCoordinator.createSession()` 的核心参数是：

- `cwd`
- `sessionManager`
- `settingsManager`
- `authStorage`
- `modelRegistry`
- `thinkingLevel`
- `resourceLoader`
- `tools`
- `customTools`
- `model`，仅新建 session 传入；恢复 session 不传，让 Pi SDK 从 JSONL 读取。

myhanako M3 必须保留“恢复 session 不传 model”的语义，避免引入第二事实源。

## 不搬运范围

P0 不搬运这些 OpenHanako 能力：

- 完整 Electron desktop、插件市场、插件开发态工具和 marketplace release 流程。
- Channel、Bridge、Telegram、Computer Use、Vision Bridge、usage ledger、复杂后台任务和 cron 产品能力。
- session compaction、cache prefix、activity/patrol、复杂 memory ticker 和多 agent product workflow。
- 完整 sandbox/checkpoint/Windows helper 体系。P0 只保留接口方向，文件写入仍先用 myhanako 已有 snapshot/patch/diff/conflict check。

## 当前 myhanako 模块归位

| myhanako 文件 | P0 归位 |
| --- | --- |
| `shared/src/session-events.ts`、`shared/src/session-projection.ts` | event mirror 和 UI projection contract。 |
| `core/src/session-event-log.ts` | append-only mirror，不是 Pi session truth。 |
| `shared/src/prompt-bundle.ts`、`core/src/prompt-assembler.ts` | prompt/tool/model transparency snapshot，不拥有 prompt 主链。 |
| `shared/src/model-ref.ts`、`core/src/model-manager.ts` | provider/id strict ref discipline，后续接入 Pi SDK ModelRegistry。 |
| `core/src/tool-registry.ts`、`core/src/command-registry.ts` | contribution definition snapshot，不单独执行工具循环。 |
| `core/src/plugin-manager.ts`、`core/src/skill-manager.ts` | 对齐 OpenHanako restricted/full-access 和 resource loader sync。 |
| `core/src/memory-service.ts`、`core/src/memory-compiler.ts` | visible memory 和 injection snapshot，注入走 Pi/OpenHanako-compatible path。 |
| `core/src/workspace-service.ts`、`core/src/diff-service.ts` | file/diff enhancement layer，挂在 Pi/OpenHanako file tools 外侧。 |
| `core/src/resource-access-service.ts`、`core/src/execution-boundary.ts` | permission projection 和 pre-execution check，对齐 full-access/restricted 边界。 |

## M1 输入约束与当前状态

M1 已经按以下边界落地，后续只允许在 adapter bugfix、SDK 版本兼容或测试补强时修改：

- 在 `package.json` 中加入项目内 Pi SDK dependency 和验证脚本。
- 新建 `lib/pi-sdk/index.ts`、`lib/pi-sdk/session-options.ts`、`lib/pi-sdk/stream-guard.ts`。
- 新增 import discipline test。
- 新增 basic adapter import smoke。
- 新增真实 Pi SDK session create/subscribe/dispose smoke。

M1 仍然不做这些事情：

- 不实现 `AgentRuntime`。
- 不创建第二套 LLM/tool loop。
- 不改造 plugin/skill execution semantics。
- 不接桌面 UI。

## 待实施前确认

- OpenHanako 当前使用 `@mariozechner/pi-ai` `0.70.5` 和 `@mariozechner/pi-coding-agent` `0.70.2`；myhanako `package.json` 已与该版本边界对齐。若重新安装依赖或升级版本，需要先请求提权并重新验证 adapter。
- 当前 myhanako 是 TypeScript 源码，OpenHanako 参考实现是 ESM JavaScript；P0 应以 TypeScript 薄适配为准，不直接复制 `.js` 文件。
- `MYHANAKO_HOME` 与 `C:\Users\Tsung-long lee\.pi\agent` 的读写边界已在 M2 bridge 中以独立 `myhanakoHome` 派生路径表达；M4 继续保持 myhanako 自身状态独立存储，只在需要兼容 auth/settings 时显式读取 PiAgent home。
