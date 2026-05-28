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
  - 参考 OpenHanako/HanakoPro 的成熟模型管理方式，`availableModels` 是模型解析的唯一事实源。
  - 模型引用采用 Hanako-style 复合键：`{ id, provider }` 或 `provider/id`。
  - 运行时边界拒绝裸 `id`，不按 id 猜 provider。
  - 支持 P0 四类模型角色映射，`smallTool` 可对齐 Hanako 的 `utility`，`largeTool` 可对齐 `utility_large`。
  - 支持 provider credentials 解析，DeepSeek strict/tool stable mode 等策略先作为 provider/model 策略字段保留。
  - `BasicModelAdapter` 生成 provider-neutral model request snapshot。
- `shared/src/model-ref.ts`
  - 复用 OpenHanako 的复合模型引用纪律：parse 可以宽松，runtime require/find/key 必须严格。

### P0/M3：plugin/skill/tool 起步

- `core/src/tool-registry.ts`
  - 支持工具注册、重复 id 拒绝、透明 tool definition snapshot。
  - 支持 tool description override，但不允许 override 改变 `schemaChecksum` 或 `permissions`。
  - 工具执行统一经过 registry 边界。
- `core/src/command-registry.ts`
  - 参考 OpenHanako/HanakoPro slash command registry/dispatcher 边界，命令由用户主动 `/xxx` 输入触发，不伪装成 skill 自动注入。
  - 只向前端暴露 command definition snapshot，不暴露 handler。
  - 支持 name/alias 归一化、核心保留命令保护、按 source/sourceId 卸载和 `command_invoked` 事件记录。
- `core/src/plugin-manager.ts`
  - 实现 P0 最小 plugin manifest/contribution 编排，保持 Hanako-style restricted/full-access 语义。
  - restricted plugin 只允许静态 tools/commands 贡献；routes/providers/extensions/runtime 保留给 full-access metadata，不在 P0 执行 extension code。
  - plugin 贡献通过 `ToolRegistry` / `CommandRegistry` 注册，禁用 plugin 时按 source/sourceId 卸载贡献。

## 验证命令

```powershell
npm test
git diff --check
```

## 远程维护状态

- 已推送远程分支：`feat/p0-event-log`
- Draft PR：暂未创建。GitHub 连接器创建 PR 返回 `Resource not accessible by integration`，本机 `gh auth status` 显示 token invalid。

## 下一步

- 继续 P0/M3：`SkillManager` 最小骨架，并接入 `PromptAssembler`；随后补 `PluginManager` 与本地 manifest 发现/加载。

## 参考标注

这些参考只用于实现对齐，不替代 `docs/design.md` 的架构基准：

- OpenHanako `core/model-manager.js`：availableModels 唯一事实源、provider credentials、model registry/provider registry 分离。
- OpenHanako `shared/model-ref.js`：模型引用必须使用 `{id, provider}` 复合键，运行时不做裸 id fallback。
- OpenHanako `core/config-coordinator.js`：chat、utility、utility_large、vision 的角色配置组织方式。
- HanakoPro `README.md`：DeepSeek strict mode、prompt/tool 透明和 Windows 体验优化作为 P0/P2 方向参考。
- 继续保持 TDD：先写测试，再实现最小代码。
