# myhanako

本仓库用于沉淀和推进 myhanako 的 PiAgent 原生架构设计、实施计划和后续工程实现。

## 当前基准

- 唯一架构文字基准：[docs/design.md](docs/design.md)
- 当前实施计划：[docs/implementation-plan.md](docs/implementation-plan.md)
- P0 开发进度记录：[docs/p0-progress.md](docs/p0-progress.md)
- 工程流程约定：[docs/engineering-workflow.md](docs/engineering-workflow.md)

未进入 `docs/design.md` 的早期讨论不作为后续开发依据，避免在实现阶段引入未审核信息。

## 项目方向

项目初步名为 `myhanako`，目标是建立长期干净、可控、可扩展的 PiAgent 原生桌面 Agent 架构。

当前路线：

- 以 PiAgent 原生 runtime、事件、PromptBundle、plugin/skill 和安全边界作为长期内核。
- 以 OpenHanako 的成熟分层作为工程骨架参考。
- 以 HanakoPro 的可控记忆、prompt/tool 透明、Diff、终端和 Windows 体验作为 P0 保底落地目标。
- 优先复用 skill/plugin 生态，`extensions/` 仅作为 full-access plugin 下的兼容预留，不作为 P0 泛用平台目标。

## 开发状态

当前阶段已推进到 P0/M3 ToolRegistry、CommandRegistry、PluginManager 与 SkillManager 起步。已有 shared event contract、append-only `SessionEventLog`、PromptBundle 契约、PromptAssembler 层装配、prompt/memory/tools/model 请求事件写入、Hanako-style 模型复合引用、模型角色映射、provider credentials 解析、provider-neutral 请求快照、工具注册边界测试、slash command 注册/调用边界测试、plugin manifest/contribution 边界测试和 skill prompt context 边界测试。

本地验证命令：

```powershell
npm test
git diff --check
```
