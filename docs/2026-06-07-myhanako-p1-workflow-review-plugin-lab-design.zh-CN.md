# P1 设计中文参考摘要：Workflow Review + Plugin Lab

日期：2026-06-07  
状态：P1 高参考中文摘要  
完整设计：[2026-06-07-myhanako-p1-workflow-review-plugin-lab-design.md](2026-06-07-myhanako-p1-workflow-review-plugin-lab-design.md)  
参考索引：[p1-reference.md](p1-reference.md)

## 核心判断

myhanako 在 P1 不再沿着“自建 PiAgent 原生桌面 Agent 内核”的路线继续扩张，而是转为 HanaAgent 的 workflow companion 与 runtime lab。

新的职责边界是：

- HanaAgent 负责真实执行、会话、工具、模型、插件、权限、自动化和桌面产品体验。
- myhanako 负责审查、解释、调整、记录和实验。
- myhanako 通过 HanaAgent full-access plugin、Hana adapter、local sidecar/core 和稳定 evidence protocol 进入 HanaAgent。
- myhanako 不做 HanaAgent 的通用聊天客户端 fork，不替代 marketplace，不绕过权限系统，不静默修改真实用户 session。

## 已核对依据

本摘要基于 2026-06-07 本地可检查材料：

- `F:\openhanako-main\package.json`：HanaAgent 当前包版本为 `0.301.8`，技术栈包含 TypeScript、Electron 42、React 19、Hono、Vite、Pi SDK `0.70.x`。
- `F:\openhanako-main\PLUGIN_SDK.md`：已记录 plugin SDK、dev loop、EventBus helpers、plugin-private sessions、Pi SDK extensions、providers、pages、widgets 和 plugin UI components。
- `F:\openhanako-main\PLUGINS.md`：已记录 `plugin.dev.install`、`plugin.dev.reload`、`plugin.dev.invokeTool`、`plugin.dev.diagnostics`、`plugin.dev.listSurfaces` 等开发态能力。
- `F:\openhanako-main\core\plugin-manager.ts`、`core\plugin-dev-service.ts`、`core\plugin-context.ts`、`server\routes\plugins.ts`：源码中存在 plugin manager、dev service、restricted/full-access trust model、EventBus bridge、pages/widgets 和 dev diagnostics 相关实现。

## P1 命名

P1 名称：

`Workflow Review + Plugin Lab`

P1 主闭环：

1. 选择或安装一个 dev plugin，或只读 attach 到一个 Hana session。
2. 检查 plugin/session/workflow 状态。
3. 执行显式安全 lab action，例如 reload、tool smoke test、plugin-private session prompt、workflow review。
4. 捕获 evidence。
5. 给出简明解释，并允许用户保存 adjustment draft 或导出 redacted evidence bundle。

## 产品原则

HanaAgent executes.  
myhanako reviews, explains, adjusts, records, and helps users experiment.

P1 有两张产品脸：

- `Expert Lab`：面向需要 inspection、diagnostics 和 controlled intervention 的开发者。
- `Workflow Guide`：面向希望用自然语言理解与调整工作流的高级用户和未来普通用户。

两张产品脸共享同一套 evidence protocol、workflow model、redaction policy 和 projection engine。

## P1 范围

P1 包含：

- Hana full-access myhanako plugin shell。
- Hana adapter capability discovery。
- plugin lab diagnostics。
- dev plugin install/reload/invoke smoke test。
- evidence envelope 与 append-only evidence log。
- basic read-only session workflow review。
- plugin-private session lab。
- workflow adjustment drafts。
- redacted evidence bundle export。
- Hana embedded UI 与 standalone UI 共用 core API。

P1 不包含：

- 通用 HanaAgent 聊天客户端。
- 一般 Hana settings、model catalog 或 marketplace 管理。
- 静默修改真实用户 session。
- 绕过 HanaAgent permission system。
- 依赖 HanaAgent renderer store 或 React component。
- 完整 file replay、terminal replay、memory graph 或 real-session intervention。

## 架构边界

```text
HanaAgent Runtime
  -> myhanako full-access plugin
    -> Hana adapter layer
      -> myhanako evidence protocol
        -> sidecar/core
          -> projections and workflow review
            -> Hana embedded UI
            -> standalone UI
```

核心约束：

- `myhanako core` 不 import HanaAgent internal modules。
- Hana 兼容性由 adapter 层吸收。
- P1 默认 observe；lab mode 必须显式启用。
- attached real sessions 在 P1 中只读。
- 所有 meaningful lab actions 和 workflow adjustments 都要写入 evidence。
- export 默认 redaction，不导出 tokens、cookies、provider credentials 或 private file contents。

## P1 验收标准

P1 成功时必须证明：

- 插件开发者可以在 myhanako 内安装或 reload 一个 dev plugin，并测试一个 tool。
- 产生的 plugin/tool/session evidence 可记录、可审查。
- 可以只读 attach 一个真实 Hana session，并生成 workflow review。
- 面向非开发者的解释能指出至少一个可能失败点或改进点。
- 自然语言反馈可以变成可审查的 workflow adjustment draft。
- 同一份 evidence 可以展开到开发者级细节。
- myhanako sidecar 关闭时，HanaAgent 继续正常工作。
- P1 没有任何 action 会静默修改真实用户 session。

## 待确认问题

- workflow adjustment drafts 只存 myhanako，还是也写入 Hana plugin-visible preference record。
- `PluginLabPort` 第一版应绑定哪组 Hana plugin dev capability 与 HTTP route。
- embedded UI 与 standalone UI 的交付顺序。
- evidence bundle 的最小可复现格式。
