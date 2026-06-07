# HanaAgent 架构全景分析参考说明

日期：2026-06-06  
状态：参考材料，不是 P1 最高优先级基准  
干净源文件：`F:\Codex-Workspace\260606think1\HanaAgent-architecture-analysis-20260606.md`

## 使用方式

本文件原本是 `HanaAgent-architecture-analysis-20260606.md` 的本地拷贝，但此前内容在 `docs` 目录中出现编码损坏，不适合作为直接引用材料。P1 后续推理若需要这份分析，应读取上方干净源文件，并以当前 HanaAgent 源码 `F:\openhanako-main` 为最终事实来源。

## 与 P1 的关系

这份分析可用于理解 HanaAgent 的整体分层和 myhanako 从 P0 到 P1 的转向背景，但不能覆盖 P1 当前高参考链路：

1. [p1-reference.md](p1-reference.md)
2. [2026-06-07-myhanako-p1-workflow-review-plugin-lab-design.md](2026-06-07-myhanako-p1-workflow-review-plugin-lab-design.md)
3. [2026-06-07-myhanako-p1-workflow-review-plugin-lab-design.zh-CN.md](2026-06-07-myhanako-p1-workflow-review-plugin-lab-design.zh-CN.md)
4. [superpowers/plans/2026-06-07-p1-workflow-review-plugin-lab.md](superpowers/plans/2026-06-07-p1-workflow-review-plugin-lab.md)

## 已吸收的关键判断

- HanaAgent 是成熟产品应用，包含 Electron/React 桌面层、Hono server、Hub/EventBus、Core/Engine、PluginManager、SkillManager、Pi SDK adapter、memory、desk、terminal、diff、bridge、sandbox 等能力。
- HanaAgent 的插件生态正在成为扩展主线，包含 restricted/full-access trust model、tools、commands、routes、providers、extensions、pages、widgets、dev plugin loop 和 EventBus capability。
- myhanako P1 不应重复建设 HanaAgent 的完整执行产品面，而应成为 workflow review、plugin lab、evidence projection 和 workflow adjustment 层。
- 旧 P0 中有价值的事件、PromptBundle、记忆透明、Diff、终端和安全边界思想，应转译为 P1 的 evidence protocol、redaction policy、adapter ports、workflow projections 和 lab action history。

## 参考限制

- 该分析原始日期为 2026-06-06，记录的 HanaAgent 版本为 `v0.297.13`。
- 本轮已核对 `F:\openhanako-main\package.json`，当前本地 HanaAgent 包版本为 `0.301.8`。
- 因此，所有具体接口、版本号、插件 API 和实现路径必须重新以 `F:\openhanako-main` 当前源码为准。
