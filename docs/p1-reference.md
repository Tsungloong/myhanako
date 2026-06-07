# myhanako P1 高参考索引

日期：2026-06-07  
阶段：P1 新基准  
主题：`Workflow Review + Plugin Lab`

## 参考级别

P1 后续讨论、拆解和实现按以下优先级取证：

1. 本索引：定义 P1 当前判断、参考顺序、边界和待确认项。
2. [P1 详细设计](2026-06-07-myhanako-p1-workflow-review-plugin-lab-design.md)：P1 的完整产品、架构、协议、API、存储、安全、失败模式、测试和验收设计。
3. [P1 中文摘要](2026-06-07-myhanako-p1-workflow-review-plugin-lab-design.zh-CN.md)：面向中文协作的简明参考。
4. [P1 实施计划](superpowers/plans/2026-06-07-p1-workflow-review-plugin-lab.md)：给后续 agentic worker 使用的任务拆解。
5. `F:\openhanako-main`：HanaAgent 当前本地源码和插件文档，以目标开发 commit 为准。
6. `F:\HanakoPro-main`：成熟体验参考，不能直接当作 HanaAgent 当前能力事实。
7. [design.md](design.md) 与 [implementation-plan.md](implementation-plan.md)：P0 历史基线，只保留设计思想，不单独决定 P1 路线。

未进入上述链路的早期讨论、零散设想和未核对材料，不作为 P1 实现依据。

## 分支整理规划

截至 2026-06-07，本仓库按以下分支关系推进：

| 分支或 PR | 当前定位 | 下一步 |
| --- | --- | --- |
| `main` | 稳定基线。远端 `main` 已包含 PR #2 的 P0/M2 auditable session 与 prompt core。 | 本地 `main` 应先同步到 `origin/main`，再承接已合并的 P0 内容和后续 P1 文档。 |
| PR #3 `feat/p0-event-log` | P0 runtime baseline 的完整实现分支，包含 event log、PromptBundle、model/runtime、plugin/skill、安全边界、memory、workspace patch、diff projection、Pi SDK adapter 和 server projection。 | 保持作为 P0 收口 PR。确认 CI 或本地验证后合入 `main`，合入后不再在该分支追加 P1 方向改动。 |
| `codex/rebaseline-p1-over-p0` | P1 转向整理分支，用于承接 HanaAgent Workflow Review + Plugin Lab 的文档基线和第一批实现计划。 | 以 P0 已合入后的 `main` 为目标基线。若 PR #3 尚未合并，本分支先保留为规划分支，避免把 P1 文档混入 P0 收口 PR。 |

推荐同步顺序：

1. 先保证本地工作区的 P1 文档改动已提交在 `codex/rebaseline-p1-over-p0`。
2. 将本地 `main` 同步到 `origin/main`。
3. 处理并合入 PR #3，让 P0 runtime baseline 成为 `main` 的历史基线。
4. 将 `codex/rebaseline-p1-over-p0` rebase 或 merge 到新的 `main`，只承接 P1 文档和后续 P1 实现入口。
5. P1 后续实现从 evidence envelope、append-only log、Hana adapter capability discovery、plugin lab diagnostics 和 read-only workflow review projection 开始。

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

本轮已核对以下本地材料：

- `F:\openhanako-main\package.json`：HanaAgent 当前包版本为 `0.301.8`，技术栈包含 TypeScript、Electron 42、React 19、Hono、Vite、Pi SDK `@mariozechner/pi-ai@0.70.5` 与 `@mariozechner/pi-coding-agent@0.70.2`。
- `F:\openhanako-main\PLUGIN_SDK.md`：记录了 `@hana/plugin-protocol`、`@hana/plugin-sdk`、`@hana/plugin-runtime`、`@hana/plugin-components`，以及 plugin-private sessions、EventBus helpers、Pi SDK extensions、provider contributions、pages、widgets。
- `F:\openhanako-main\PLUGINS.md`：记录了 dev plugin loop，包括 `plugin.dev.install`、`plugin.dev.reload`、`plugin.dev.invokeTool`、`plugin.dev.diagnostics`、`plugin.dev.listSurfaces`、HTTP dev routes、`devRunId` 护栏和 full-access dev 授权。
- `F:\openhanako-main\core\plugin-manager.ts`、`core\plugin-dev-service.ts`、`core\plugin-context.ts`、`server\routes\plugins.ts`：源码中存在 plugin manager、dev service、restricted/full-access trust model、EventBus bridge、pages/widgets 和 dev diagnostics surface。
- `F:\Codex-Workspace\myhanako` 当前没有 P1 源码，主要是文档仓库；因此 P1 计划必须先从目录结构、contracts、adapter 和 evidence model 开始。

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

1. `myhanako` full-access plugin shell。
2. Hana adapter capability discovery。
3. evidence envelope 与 append-only log。
4. plugin lab diagnostics。
5. dev plugin reload 与 tool smoke test。
6. read-only workflow review projection。
7. redaction policy 与 evidence bundle export。

任何功能只要需要修改真实 Hana session，默认推迟到 P2 或更晚，并必须重新设计权限和确认流程。

## 待确认项

- P1 目标 HanaAgent commit 或版本窗口。
- myhanako sidecar 的进程生命周期由 Hana plugin 启动，还是由 standalone UI 启动。
- workflow adjustment drafts 第一版只保存在 myhanako，还是写入 Hana plugin-visible preference record。
- embedded UI 与 standalone UI 的交付顺序。
- evidence bundle 最小格式和脱敏策略的第一版字段。
