# myhanako

本仓库用于沉淀和推进 myhanako 的架构设计、实施计划和后续工程实现。

2026-06-07 起，myhanako 进入 P1 新阶段：从“自建 PiAgent 原生桌面 Agent 内核”转向“面向 HanaAgent 的 Workflow Review + Plugin Lab 增强层”。旧 P0 文档保留为历史基线和设计来源，但不再作为 P1 的唯一前进依据。

## 当前基准

- P1 高参考索引：[docs/p1-reference.md](docs/p1-reference.md)
- P1 详细设计：[docs/2026-06-07-myhanako-p1-workflow-review-plugin-lab-design.md](docs/2026-06-07-myhanako-p1-workflow-review-plugin-lab-design.md)
- P1 中文摘要：[docs/2026-06-07-myhanako-p1-workflow-review-plugin-lab-design.zh-CN.md](docs/2026-06-07-myhanako-p1-workflow-review-plugin-lab-design.zh-CN.md)
- P1 实施计划：[docs/superpowers/plans/2026-06-07-p1-workflow-review-plugin-lab.md](docs/superpowers/plans/2026-06-07-p1-workflow-review-plugin-lab.md)
- 历史 P0 架构基准：[docs/design.md](docs/design.md)
- 历史 P0 实施计划：[docs/implementation-plan.md](docs/implementation-plan.md)
- 工程流程约定：[docs/engineering-workflow.md](docs/engineering-workflow.md)

未进入上述 P1 参考链路的早期讨论不作为 P1 后续开发依据，避免在实现阶段引入未审核信息。

当前分支整理以 `docs/p1-reference.md` 的“分支整理规划”为准：`main` 承接稳定基线，PR #3 `feat/p0-event-log` 作为 P0 runtime baseline 收口 PR，`codex/rebaseline-p1-over-p0` 承接 P1 转向文档和后续实现入口。

## 项目方向

项目初步名为 `myhanako`，当前目标是建立长期干净、可控、可扩展的 HanaAgent workflow companion 与 runtime lab。

当前路线：

- HanaAgent 负责真实执行、会话、工具、模型、插件、权限和桌面产品面。
- myhanako 负责审查、解释、调整、记录和实验，不做 HanaAgent 的通用聊天 fork。
- P1 通过 full-access plugin、Hana adapter、local sidecar/core 和共享 evidence protocol 进入 HanaAgent。
- P1 聚焦 `Workflow Review + Plugin Lab`：插件开发诊断、工具 schema 检查、只读 workflow review、plugin-private lab session、redacted evidence bundle。
- 旧 P0 的事件、PromptBundle、可控记忆、Diff、终端和安全边界思想被吸收到 evidence protocol、projection、redaction、lab action history 和 workflow adjustment draft 中。

## 开发状态

`main` 已包含 P0/M2 PromptBundle 与 PromptAssembler 骨架：shared event contract、append-only `SessionEventLog`、PromptBundle 契约、PromptAssembler 层装配和 prompt/memory/tools/model 请求事件写入测试。

接下来工程重心转向 P1。后续代码实现应从 Hana full-access plugin shell、adapter capability discovery、evidence envelope、append-only evidence log 和 plugin lab diagnostics 开始。

本地验证命令：

```powershell
npm test
git diff --check
```
