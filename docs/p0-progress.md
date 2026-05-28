# P0 开发进度记录

本文档只记录 P0 实施进度、验证命令和维护状态，不是架构基准。架构判断只以 [design.md](design.md) 为准。

## 当前分支

- 本地分支：`feat/p0-event-log`
- 远程分支：`origin/feat/p0-event-log`
- 当前维护方式：小里程碑验证后提交，定期推送远程分支。

## 已实现

### P0/M1：协议与事件

- `shared/src/session-events.ts`
  - 定义 P0 `SessionEvent` 类型、事件类型集合和 payload contract。
  - 包含 prompt、memory、tool、file、terminal、interrupt、recall、recovery 等事件。
- `shared/src/session-projection.ts`
  - 从 append-only event log 投影基础 transcript。
  - `message_recalled` 只标记投影状态，不删除历史事件。
- `core/src/session-event-log.ts`
  - 提供 append-only `SessionEventLog`。
  - 支持 per-session sequence、并发 append 串行化、内存存储、JSONL 存储和 replay。

### P0/M2：Prompt 与模型

- `shared/src/prompt-bundle.ts`
  - 定义 `PromptBundle`、`PromptMessage` 和 `ModelRole`。
- `core/src/prompt-assembler.ts`
  - 统一装配 prompt layers。
  - 生成 checksum、token estimate、tokenBudget warning。
  - 写入 `prompt_layers_resolved`、`memory_injected`、`tools_resolved`、`model_request_started`。
- `core/src/model-manager.ts`
  - `ModelManager` 支持 P0 四类模型角色映射，默认可映射到同一个主模型。
  - `BasicModelAdapter` 生成 provider-neutral model request snapshot。

## 验证命令

```powershell
npm test
git diff --check
```

## 远程维护状态

- 已推送远程分支：`feat/p0-event-log`
- Draft PR：暂未创建。GitHub 连接器创建 PR 返回 `Resource not accessible by integration`，本机 `gh auth status` 显示 token invalid。

## 下一步

- 继续 P0/M3：`ToolRegistry`、`CommandRegistry`、`PluginManager`、`SkillManager` 最小骨架。
- 继续保持 TDD：先写测试，再实现最小代码。
