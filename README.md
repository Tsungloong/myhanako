# myhanako

本仓库用于沉淀和推进 myhanako 的 OpenHanako-first PiAgent runtime 基线设计、实施计划和后续工程实现。

## 当前基准

- 唯一架构文字基准：[docs/design.md](docs/design.md)
- 当前实施计划：[docs/implementation-plan.md](docs/implementation-plan.md)
- P0 开发进度记录：[docs/p0-progress.md](docs/p0-progress.md)
- 工程流程约定：[docs/engineering-workflow.md](docs/engineering-workflow.md)

未进入 `docs/design.md` 的早期讨论不作为后续开发依据，避免在实现阶段引入未审核信息。

## 项目方向

项目初步名为 `myhanako`，目标是在 OpenHanako 已验证产品基座上接入 Pi SDK 原生 runtime，并把 myhanako 的透明化、审计、记忆、Diff、终端和 Windows 体验作为增强层持续演进。

当前路线：

- 以 OpenHanako 的 `Engine -> SessionCoordinator -> createAgentSession -> SessionManager -> DefaultResourceLoader` 主链作为 P0 基座。
- 以项目内 Pi SDK 依赖和 `lib/pi-sdk` 适配层作为 runtime 事实入口，不依赖系统 PATH 中的 `pi` CLI。
- 保留现有 `SessionEventLog`、`PromptBundle`、`MemoryCompiler`、`DiffModel` 等模块作为透明化、审计和 UI 投影增强层。
- 以 HanakoPro 的可控记忆、prompt/tool 透明、Diff、终端和 Windows 体验作为 P0/P1 迭代优化方向。
- 优先复用 Pi SDK / Pi package / skill/plugin 生态，`extensions/` 仅作为 full-access plugin 下的 Pi SDK 深度入口，不作为 P0 泛用平台目标。

## 开发状态

当前代码已推进到旧 P0/M5 文件受控链路起步。已有 shared event contract、append-only `SessionEventLog`、PromptBundle 契约、PromptAssembler 层装配、P0 可见记忆存储/JSONL 持久化/来源查询/编译闭环、文件 snapshot/patch/diff/受控写入链路、prompt/memory/tools/model 请求事件写入、Hanako-style 模型复合引用、模型角色映射、provider credentials 解析、provider-neutral 请求快照、工具注册边界测试、slash command 注册/调用边界测试、plugin manifest/contribution 边界测试、本地 plugin manifest 发现/加载边界测试、plugin audit event 边界测试、受限 service facade / execution boundary 边界测试和 skill prompt context 边界测试。

这些模块现在按 [docs/design.md](docs/design.md) 归位为 contract、mirror、projection、snapshot 和增强层。OpenHanako-first M0 audit、M1 `lib/pi-sdk` adapter、M2 Model/Auth bridge、M3 `Engine` / `SessionCoordinator`、M4 `RuntimeResourceLoader`、`runtime-contributions`、tool parameter schema passthrough、SkillManager resource sync、resolved transparency snapshot、per-call execution subject 权限透传与 `SessionRuntimeResolver` 会话创建前组装已落地；下一步继续 [docs/implementation-plan.md](docs/implementation-plan.md) 的 projection/server 接入。

本地验证命令：

```powershell
npm run test:pi-adapter
npm test
git diff --check
```
