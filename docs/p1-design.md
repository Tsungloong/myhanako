# P1 设计基准：Workflow Review + Plugin Lab

日期：2026-06-07
状态：P1 高参考设计基准
事实源入口：[p1-reference.md](p1-reference.md)

## 背景

myhanako 不应成为 HanaAgent 的弱化复制品，也不应停留在只读 trace viewer。更有价值的方向，是保留 HanakoPro 展现出的控制感，同时让这种控制更安全、更可解释、更适合非开发者逐步使用。

HanaAgent 正在快速变化，插件系统正在成为平台扩展层。myhanako 因此应通过 HanaAgent plugin system 进入 HanaAgent，但长期核心不能绑定 HanaAgent 当前 renderer internals 或私有 runtime modules。

P1 聚焦一个实际产品闭环：

1. 开发者或高级用户选择 Hana session、plugin 或 workflow attempt。
2. myhanako 解释发生了什么。
3. 用户调整 workflow、plugin、tool、prompt context 或实验目标。
4. HanaAgent 执行真实动作。
5. myhanako 记录 evidence，并让结果可审查。

## 产品原则

HanaAgent executes.
myhanako reviews, explains, adjusts, records, and helps users experiment.

P1 有两张产品脸：

- `Expert Lab`：面向需要 inspection、diagnostics 和 controlled intervention 的开发者。
- `Workflow Guide`：面向希望用自然语言理解与调整工作流的高级用户和未来普通用户。

两张产品脸共享同一套 evidence protocol、workflow model、redaction policy 和 projection engine。

## P1 范围

P1 名称：

`Workflow Review + Plugin Lab`

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

## 核心用户

### HanaAgent Developer

需要完整可见性和受控自由：

- inspect runtime evidence。
- test plugin contributions。
- compare tool schema before and after reload。
- diagnose prompt、provider、cache、permission behavior。

### Plugin and Workflow Builder

创建 plugins、skills、providers、scenarios 和 automations：

- install and reload dev plugins。
- run tool smoke tests。
- open plugin pages/widgets。
- diagnose plugin visibility or callable failures。
- package evidence for issue reports。

### Advanced Natural-Language User

主要用自然语言指挥 HanaAgent，但希望优化重复工作流：

- 理解结果为什么不好。
- 告诉系统下次应如何做。
- 在保存前审查 proposed workflow adjustments。
- 复用成功 workflow recipe。

## 系统架构

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

### HanaAgent Runtime

HanaAgent 保持以下事实源身份：

- sessions。
- tools。
- prompts。
- plugins。
- providers。
- permissions。
- automation。
- task execution。
- files。
- terminal。
- frontend product surfaces。

myhanako 不重新实现这些职责。

### myhanako Full-Access Plugin

职责：

- 提供 Hana embedded entry points。
- 订阅 session 和 runtime events。
- 调用 Hana EventBus capabilities。
- 暴露 plugin routes 给 myhanako bridge/status APIs。
- 通过 full-access extensions 观察 pipeline events。
- 在可用时通过 Hana plugin dev APIs 支持 lab actions。
- 把 normalized evidence 转发给 myhanako core。

约束：

- 默认模式是 observe。
- lab mode 必须显式激活。
- real-session intervention 不属于 P1。
- pipeline rewrite 不属于 P1。

### Hana Adapter Layer

职责：

- 隔离当前 Hana plugin protocol 和 EventBus shapes。
- 把 Hana payloads 映射成 myhanako evidence records。
- 提供 capability discovery。
- 当 Hana capability 不可用或仍是 experimental 时优雅降级。

Adapter ports：

```ts
interface PluginLabPort {
  installDevPlugin(input): Promise<LabActionResult>;
  reloadDevPlugin(input): Promise<LabActionResult>;
  invokePluginTool(input): Promise<LabActionResult>;
  readPluginDiagnostics(input): Promise<PluginDiagnostics>;
  listPluginSurfaces(input): Promise<PluginSurface[]>;
}

interface RuntimeEvidencePort {
  subscribe(handler): Disposable;
  getSessionEvidence(sessionRef): Promise<SessionEvidence>;
}

interface PipelineEvidencePort {
  attach(handler): Disposable;
}

interface WorkflowAdjustmentPort {
  draftAdjustment(input): Promise<WorkflowAdjustmentDraft>;
  saveAdjustment(draft): Promise<WorkflowAdjustmentRecord>;
}
```

### myhanako Core

职责：

- ingest evidence records。
- persist append-only raw records。
- generate projections。
- build workflow explanations。
- manage redaction。
- manage lab action history。
- expose query APIs to UI shells。

Core must not import HanaAgent internal modules.

## Evidence Protocol

P1 定义小而稳定的 envelope，再加 typed evidence families。

```ts
type EvidenceEnvelope = {
  schemaVersion: number;
  eventId: string;
  eventType: string;
  timestamp: string;
  sequence: number;
  hanaVersion: string;
  hanaPluginProtocolVersion?: number;
  adapterVersion: string;
  probeVersion: string;
  piSdkVersion?: string;
  source: {
    capability?: string;
    stability?: "stable" | "experimental" | "unknown";
    layer: "session" | "plugin" | "tool" | "prompt" | "pipeline" | "permission" | "workflow" | "lab";
  };
  refs: {
    sessionPath?: string;
    turnId?: string;
    toolCallId?: string;
    pluginId?: string;
    labRunId?: string;
    workflowId?: string;
  };
  sensitivity: "public" | "internal" | "secret-adjacent" | "secret";
  redaction: {
    applied: boolean;
    fields: string[];
  };
  payload: unknown;
  rawSource?: unknown;
};
```

P1 typed families：

- `PluginEvidence`
- `ToolEvidence`
- `PromptEvidence`
- `PipelineEvidence`
- `SessionEventEvidence`

其他 records 可先作为 raw evidence 存储，等稳定后再进入 typed projection。

## Workflow Model

P1 默认体验不暴露 raw trace。

Workflow Review projection：

```text
Goal
  -> Steps attempted
  -> Tools/plugins used
  -> Inputs and context used
  -> Failure or uncertainty points
  -> Suggested adjustments
  -> Saved preferences or recipe draft
```

Adjustment draft：

```ts
type WorkflowAdjustmentDraft = {
  draftId: string;
  title: string;
  userIntent: string;
  scope: "one-off" | "session" | "agent" | "workflow-template";
  proposedRules: Array<{
    condition: string;
    action: string;
    risk: "low" | "medium" | "high";
    evidenceRefs: string[];
  }>;
  requiresConfirmation: true;
};
```

P1 只创建 drafts 并记录 confirmations，不静默修改 HanaAgent 行为。

## API Design

P1 sidecar/core API local-first：

- `POST /v1/evidence`
- `GET /v1/sessions/{sessionId}/workflow-review`
- `GET /v1/plugins/{pluginId}/lab`
- `POST /v1/lab/actions`
- `POST /v1/workflow-adjustments/draft`
- `POST /v1/workflow-adjustments/{draftId}/confirm`
- `POST /v1/evidence-bundles`

P1 lab actions：

- `plugin.install_dev`
- `plugin.reload_dev`
- `plugin.invoke_tool`
- `plugin.open_surface`
- `session.create_plugin_private`
- `session.send_lab_message`

## Security

P1 使用 full-access Hana plugin，因此 myhanako 必须增加内部权限门。

P1 启用：

- `observe`
- `lab`
- `route`
- `export`

P1 不启用：

- real-session intervention。
- provider request rewrite。
- silent workflow mutation。

规则：

- full-access plugin 必须对开发者可见。
- lab mode 必须显式开启。
- sidecar communication 只允许 localhost。
- sidecar token 每次启动生成。
- secret fields 默认 redacted。
- raw provider credentials、cookies、tokens 和 private file contents 默认不导出。
- 用户可以 purge evidence data。
- lab runs 标记为 synthetic。
- attached real sessions 在 P1 中只读。

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
