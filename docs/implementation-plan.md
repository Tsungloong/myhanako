# myhanako OpenHanako-first P0 实施计划

本计划以 [design.md](design.md) 为唯一架构基准。旧版“PiAgent 原生内核优先”计划已经停止作为实施依据；P0 现在以 OpenHanako 成熟主链和 Pi SDK session runtime 为第一优先级。

## 1. 当前状态

当前仓库已经有一批 clean-room P0 模块：

- shared contract：`session-events`、`session-projection`、`prompt-bundle`、`model-ref`。
- core 服务：`SessionEventLog`、`PromptAssembler`、`ModelManager`、`ToolRegistry`、`CommandRegistry`、`PluginManager`、`SkillManager`。
- 增强层：`MemoryService`、`MemoryCompiler`、`WorkspaceService`、`DiffService`、`ResourceAccessService`、`ExecutionBoundary`。

这些模块不删除，但在 P0 实施中重新定位为 contract、mirror、projection、snapshot 和增强层。

截至 2026-05-29，本轮 OpenHanako-first 收敛状态是：

- M0 compatibility audit 已落地：`docs/openhanako-compat-audit.md` 记录了 OpenHanako 关键模块的复用、薄适配和不搬运结论。
- M1 Pi SDK adapter 已落地：`package.json`、`lib/pi-sdk/*`、`lib/test/pi-sdk-adapter.test.ts`、`lib/test/import-discipline.test.ts` 已存在。
- M2 Model and auth bridge 已落地：`ModelManager` 可接收 Pi `AuthStorage` / `ModelRegistry` bridge，从 registry 刷新 `availableModels`，并提供不泄露 secret 的 credential status。
- M3 Engine and SessionCoordinator 已落地：`core/src/engine.ts` 是 thin facade，`core/src/session-coordinator.ts` 负责 create/recover/dispose、stream event 转发和 `SessionEventLog` mirror。
- M4 RuntimeResourceLoader 最小入口已落地：`core/src/runtime-resource-loader.ts` 初始化 `DefaultResourceLoader`，调用 `reload()`，并输出 `resourceLoader`、`tools`、`customTools`、skills 和 diagnostics snapshot。
- M4 contribution 输出契约已落地：`core/src/runtime-contributions.ts` 可把 `ToolRegistry` definition snapshot 转为 Pi `customTools` wrapper 和 `tools` name allowlist，把 `CommandRegistry` 保留为 command snapshot，并把 full-access plugin extension 声明交给 `RuntimeResourceLoader` 的受控 path 入口。
- M4 session runtime wiring 已落地：`core/src/session-runtime-resolver.ts` 在创建 session 前解析当前 contributions、reload resource loader，并把 `resourceLoader` / `tools` / `customTools` 交给 `SessionCoordinator`；`SessionCoordinator` 支持静态 runtime 或异步 runtime provider。
- M4 tool parameter schema passthrough 已落地：`ToolDefinitionSnapshot.parameters` 可把真实 JSON schema 传给 Pi `customTools.parameters`；缺省时才使用显式 JSON object fallback。
- M4 SkillManager resource sync 已落地：文件型 enabled skill 会输出 Pi-compatible resource skill；纯 prompt skill 保留为 prompt layer，并通过 diagnostics 标记不能进入 Pi resource sync。
- M4 resolved transparency snapshot 已落地：`RuntimeResourceLoader.toTransparencySnapshot()` 提供 reload 后的 tool/command/plugin/skill/path/diagnostic 快照，上层不需要读取内部 state。
- M4 per-call execution subject 权限透传已落地：Pi custom tool wrapper 会从调用上下文读取 `executionSubject` / `subject`，交给 `ToolRegistry` / `ExecutionBoundary` 做统一授权判定。
- 当前下一步是进入 projection/server 接入。

P0 剩余主要缺口是：

- `DefaultResourceLoader` / tool / plugin / skill contribution 主链。
- server websocket projection。
- send/interrupt、resolved tools、stream projection 和 server-level session smoke。

## 2. 实施原则

- OpenHanako-first：优先复用 `F:\openhanako-main` 已验证的模块边界和调用顺序。
- Pi SDK truth：Pi session、`SessionManager`、`DefaultResourceLoader` 和 ModelRegistry 是 runtime truth。
- myhanako 增强层旁路接入：event log、memory、diff、prompt/tool snapshot 只做透明化、审计和 UI 投影。
- 小步验证：每个 milestone 都要有可运行的测试或 smoke，不能只提交结构代码。
- 不扩大旧 runtime：在 `DefaultResourceLoader` 对齐前，不继续扩展自建 tool/plugin/skill 执行能力。
- 文档迭代最多 3 轮：第 1 轮同步证据，第 2 轮收敛实施契约，第 3 轮验证并进入 M2/M3 开发。

## 3. P0 里程碑

### M0：OpenHanako compatibility audit

目标：在写 runtime 代码前锁定复用策略。

交付：

- 新建 `docs/openhanako-compat-audit.md`。
- 审计 `F:\openhanako-main\lib\pi-sdk\index.js`、`core\engine.js`、`core\session-coordinator.js`、`core\model-manager.js`、`core\plugin-manager.js`、`core\skill-manager.js`、`PLUGINS.md`。
- 标注每个模块是直接复用、薄适配、只借鉴还是不搬运。
- 列出 myhanako 现有文件的保留、修改、降级和重接策略。

验收：

- `docs/openhanako-compat-audit.md` 能指导 M1-M4 文件落点。
- `docs/design.md` 和本计划没有 clean-room runtime first 的冲突说法。
- `git diff --check` 通过。

### M1：Pi SDK dependency and adapter

目标：项目内可以通过统一边界导入 Pi SDK。

交付：

- 修改 `package.json`，加入 Pi SDK 依赖和验证脚本。
- 新建 `lib/pi-sdk/index.ts`。
- 新建 `lib/pi-sdk/session-options.ts`。
- 新建 `lib/pi-sdk/stream-guard.ts`。
- 新建 `lib/test/pi-sdk-adapter.test.ts`，覆盖 built-in tool names、tools/customTools normalization 和错误工具提前失败。
- 新建 `lib/test/import-discipline.test.ts`，禁止生产代码直接 import `@mariozechner/pi-*`。

验收：

- adapter re-export `createAgentSession`、`SessionManager`、`SettingsManager`、`DefaultResourceLoader`、`AuthStorage`、`ModelRegistry`。
- 测试能证明业务代码只通过 `lib/pi-sdk` 接触 Pi SDK。
- 如果安装依赖需要网络或写权限，执行前先请求提权。
- M1 不创建真实 session；真实 `createAgentSession` smoke 放到 M3。

### M2：Model and auth bridge

目标：模型与凭证解析进入 OpenHanako/Pi SDK 路线。

交付：

- 改造 `core/src/model-manager.ts`，接入 `AuthStorage`、`ModelRegistry` 和 available models refresh。
- 保留 `shared/src/model-ref.ts` 的 provider/id strict ref 纪律。
- 明确 `MYHANAKO_HOME`、PiAgent home 和 auth/settings 的读写边界。
- 增加 provider credentials resolution 测试。

验收：

- `{ provider, id }` 和 `provider/id` 可以解析到 SDK model object。
- 裸 id 在 runtime 边界被拒绝。
- credential 缺失返回明确错误，不做猜测 fallback。

### M3：Engine and SessionCoordinator

目标：完成真实 session runtime bridge。

交付：

- 新建 `core/src/engine.ts`，作为 thin facade。
- 新建 `core/src/session-coordinator.ts`。
- 使用 `SessionManager.create/open` 管理 session 文件。
- 只通过 `lib/pi-sdk.createAgentSession` 创建 session。
- 订阅 Pi stream，并转发到内部 event bus。
- 新增 create/open/recover/dispose 测试或 smoke。

验收：

- 能创建一个真实 Pi SDK session。
- 能恢复已有 session 文件。
- session dispose 会清理 subscription 和 runtime resources。
- `SessionEventLog` 未被当作 session truth。

当前状态：最小 M3 已完成。真实 Pi SDK smoke 覆盖 session create/subscribe/dispose；recover 行为通过注入式 `SessionCoordinator` 测试证明恢复时不传 model。server send/interrupt 和工具执行 smoke 不属于最小 M3，进入 M4-M6。

### M4：ResourceLoader, plugin, skill, tool pipeline

目标：让 tools、skills、plugin contributions 进入 Pi session options。

交付：

- 新建 `core/src/runtime-resource-loader.ts`。
- 初始化 `DefaultResourceLoader`。
- 改造 `PluginManager` 输出 restricted/full-access contribution。
- 改造 `SkillManager` 输出 enabled skills 和 prompt/resource metadata。
- 改造 `ToolRegistry` / `CommandRegistry` 为 definition snapshot 和 contribution source。
- 对齐 `buildTools`：Pi built-in tools、custom tools、plugin tools、权限包装。

验收：

- session 创建前可以得到 resolved tools/customTools。
- restricted plugin 不执行 runtime code。
- full-access extension factories 只通过受控入口进入 resource loader。
- tool transparency 读取最终 resolved definitions，不创建第二 truth source。

### M5：Projection and transparency

目标：把 Pi/OpenHanako runtime 事件接到 myhanako 可见层。

交付：

- 改造 `SessionEventLog` 为 event mirror。
- 改造 `PromptAssembler` 为 prompt/tool/model snapshot builder。
- 接入 memory compile/injection snapshot。
- 定义 websocket projection contract。
- 增加 stream event -> mirror event 测试。

验收：

- user/assistant/tool/model/memory/file/terminal 关键事件能被镜像。
- mirror 写入失败不阻断 Pi session，但会产生审计降级提示。
- prompt/tool snapshot 不改变 Pi SDK session contract。

### M6：Minimal server smoke

目标：提供进入桌面前的最小可操作接口。

交付：

- 新建 `server/` 最小本地服务。
- 提供 session create/open/send/interrupt API。
- 提供 models、events、inspector API。
- 提供 websocket event stream。
- 新增端到端 smoke：创建 session、发送消息、收到 stream、查询 event mirror。

验收：

- 不依赖 Electron renderer 就能完成一次最小对话 smoke。
- server 只代理 runtime 和 projection，不持有第二事实源。

### M7：File, diff, terminal enhancement bridge

目标：把现有文件、diff、终端增强层接到主链外侧。

交付：

- 将 `WorkspaceService`、`DiffService` 接入 Pi/OpenHanako 文件工具外侧。
- 补 terminal output normalization 事件模型。
- 形成 FileDiffCard 和 Terminal card 的后端 projection 数据。

验收：

- 文件写入仍有路径策略、snapshot、patch、diff 和 checksum conflict check。
- 终端 stdout/stderr 保持顺序事件化。
- 增强层不绕过 Pi SDK/OpenHanako runtime。

## 4. 首批实施顺序

M0/M1/M2/M3 已经完成，M4 ResourceLoader、首版 contribution resolver、tool parameter schema passthrough、SkillManager resource sync、resolved transparency snapshot、per-call execution subject 权限透传和 session 创建前 runtime wiring 已落地；M5 stream mirror / inspector、M6 local server smoke 和 M7 file/diff/terminal enhancement projection 也已形成最小完整系统验证基线。

P0 收尾后继续时按以下顺序执行：

1. 运行 `npm run test:pi-adapter`、`npm test` 和 `git diff --check main...HEAD`，确认 P0 基线仍然通过。
2. 进入 P1 Hanako-style desktop / server client 消费层设计。
3. 在 P1 涉及真实 send projection 时，补齐 `/sessions/send` 到 websocket stream begin、`session_user_message` 和 resume 的真实链路测试。
4. 在 P1/P2 涉及 command UI 或 slash command palette 时，处理 command alias snapshot 与 lookup 冲突的行为。

## 5. 验证策略

文档更新：

```powershell
git diff --check
```

现有 TypeScript contract/service 变更：

```powershell
npm test
```

如果当前沙箱阻止 `npm test` 的 Node test runner spawn，可逐个运行测试文件作为替代验证，并在结果中说明原因。

引入 Pi SDK 后新增：

```powershell
npm run test:pi-adapter
npm run test:import-discipline
```

接入真实 session 后新增：

```powershell
npm run test:pi-adapter
```

真实 session smoke 已纳入 `npm run test:pi-adapter` 的 `lib/test/pi-sdk-session-smoke.test.ts`。后续如果 server-level session smoke 独立成脚本，再新增 `smoke:session`，不得提前在文档中声称该脚本存在。

## 6. 当前下一步

下一次代码实施进入 P1：以现有 P0 local server / websocket / inspector / event mirror 为基础，设计并实现 Hanako-style desktop 或 server client 消费层。任何需要安装依赖、访问网络、写 `.git`、推送远端或更新 PR metadata 的操作，都先请求提权；如果提权路径不可用，按 [engineering-workflow.md](engineering-workflow.md) 的 GitHub / 远程维护故障处理规则切换路径或汇报人工操作步骤。
