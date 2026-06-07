# P1 Design: myhanako Workflow Review and Plugin Lab

Date: 2026-06-07  
Status: High-reference P1 baseline  
Primary repository context: `F:\openhanako-main`  
Reference context: `F:\HanakoPro-main`, `F:\Codex-Workspace\260606think1\HanaAgent-architecture-analysis-20260606.md`  
Reference index: `docs/p1-reference.md`

## Evidence Basis

This document is promoted from review draft to high-reference P1 baseline because the local reference sources now support the pivot:

- `F:\openhanako-main\package.json` identifies the current HanaAgent package as `hanako` version `0.301.8`, with TypeScript, Electron 42, React 19, Hono, Vite, and Pi SDK `@mariozechner/pi-ai@0.70.5` / `@mariozechner/pi-coding-agent@0.70.2`.
- `F:\openhanako-main\PLUGIN_SDK.md` documents Hana plugin SDK packages, dev loop actions, plugin-private sessions, EventBus helpers, Pi SDK extensions, provider contributions, pages, widgets, and plugin UI components.
- `F:\openhanako-main\PLUGINS.md` documents the practical dev plugin loop through `plugin.dev.install`, `plugin.dev.reload`, `plugin.dev.invokeTool`, `plugin.dev.diagnostics`, `plugin.dev.listSurfaces`, and related HTTP routes.
- `F:\openhanako-main\core\plugin-manager.ts`, `core\plugin-dev-service.ts`, `core\plugin-context.ts`, and `server\routes\plugins.ts` confirm the current plugin manager, dev service, full-access/restricted trust model, EventBus bridge, pages, widgets, and dev diagnostics surfaces exist in source.
- The older myhanako P0 docs remain useful as design memory, but their "self-owned PiAgent desktop runtime" direction is superseded for P1 by this HanaAgent adapter/plugin strategy.

Unverified or unstable claims must stay out of implementation tasks until confirmed against the target HanaAgent commit used for development.

## Background

myhanako should not become a weaker copy of HanaAgent, and it should not stop at a read-only developer trace viewer. The useful path is to preserve the freedom demonstrated by HanakoPro while making that freedom safer, more explainable, and more approachable.

HanaAgent is moving quickly. The latest source is mostly TypeScript, the plugin system is becoming the platform extension layer, and the frontend is expected to change significantly. That means myhanako must enter HanaAgent through the plugin system, but keep its long-term core separate from HanaAgent's current internals.

P1 should therefore focus on a practical product loop:

1. A developer or advanced user selects a Hana session, plugin, or workflow attempt.
2. myhanako explains what happened in a user-appropriate way.
3. The user can adjust the workflow, plugin, tool, prompt context, or experiment target.
4. HanaAgent performs the real execution.
5. myhanako records the evidence and makes the result reviewable.

This gives developers HanakoPro-style control while creating a future path for non-developer users who mainly direct HanaAgent through natural language.

## Registered Pain Points

- A read-only evidence viewer would feel weaker than HanakoPro.
- A developer-only DevTools product would not scale to broader user groups.
- A general chat UI would turn myhanako into a HanaAgent fork.
- Full-access plugins provide needed freedom, but without audit they become dangerous.
- HanaAgent's rapid changes make direct dependency on internal modules hard to maintain.
- Normal users do not want raw traces, but they do need actionable explanations.
- Plugin ecosystems create a discovery and diagnosis burden for non-expert users.
- Failed workflows need adjustment handles, not only logs.
- Future HanaAgent frontend changes must not break myhanako's core.
- HanakoPro's strength is not only observability; it is reviewable intervention and control.

## Goals

- Provide a P1 workflow review experience that explains a HanaAgent run in practical terms.
- Provide a plugin lab that lets developers install, reload, test, and diagnose dev plugins.
- Preserve developer freedom through explicit lab actions rather than hidden mutation.
- Let advanced users adjust workflow behavior through natural language review and confirmation.
- Keep HanaAgent as the execution product and plugin host.
- Keep myhanako's durable core independent from HanaAgent renderer internals, Pi SDK event shapes, and private runtime modules.
- Record every meaningful lab action and workflow adjustment as evidence.
- Support both Hana embedded UI and standalone UI from the same core API.

## Non-Goals

- Do not build a replacement HanaAgent chat client.
- Do not manage general Hana settings, model catalogs, or normal plugin marketplace flows.
- Do not silently modify real user sessions.
- Do not bypass HanaAgent's permission system.
- Do not depend on HanaAgent renderer stores or React components.
- Do not commit to supporting all historical HanaAgent versions.
- Do not implement full file replay, terminal replay, memory graph, or runtime intervention in P1.

## Target Users

### Core HanaAgent Developer

Needs full visibility and controlled freedom:

- inspect runtime evidence;
- test plugin contributions;
- compare tool schema before and after reload;
- diagnose prompt, provider, cache, and permission behavior.

### Plugin and Workflow Builder

Creates plugins, skills, providers, scenarios, and automations without necessarily changing HanaAgent core:

- install and reload dev plugins;
- run tool smoke tests;
- open plugin pages/widgets;
- diagnose why a plugin is not visible or not callable;
- package evidence for issue reports.

### Advanced Natural-Language User

Mostly commands HanaAgent in natural language but wants to tune repeated workflows:

- understand why a result was poor;
- tell the system how to do it next time;
- review proposed workflow adjustments before saving them;
- reuse a successful workflow recipe.

### Broader Future User

Does not want technical traces:

- sees concise explanations;
- chooses from safe adjustment options;
- relies on myhanako to translate feedback into reviewable workflow preferences.

## Product Principle

myhanako should be a workflow companion and runtime lab for HanaAgent.

HanaAgent executes.  
myhanako reviews, explains, adjusts, records, and helps users experiment.

The two product faces are:

- Expert Lab: for developers who need inspection and intervention.
- Workflow Guide: for users who need low-friction review and adjustment.

Both faces share the same evidence protocol, workflow model, redaction policy, and projection engine.

## P1 Scope

P1 is named:

`Workflow Review + Plugin Lab`

P1 has one primary success loop:

1. Select or install a dev plugin, or attach to a Hana session.
2. Inspect plugin/session/workflow state.
3. Run a safe lab action, such as reload, tool smoke test, plugin-private session prompt, or workflow review.
4. Capture evidence.
5. Present a concise explanation and allow the user to save an adjustment or export an evidence bundle.

## P1 User Flows

### Flow 1: Plugin Lab

Purpose: preserve HanakoPro-style developer freedom in a safer, auditable form.

Steps:

1. User opens myhanako from HanaAgent plugin page or standalone UI.
2. User selects a dev plugin source or an already installed dev plugin.
3. myhanako shows plugin status, trust level, contributions, routes, tools, providers, extensions, pages/widgets, load errors, and EventBus capability availability.
4. User runs `install`, `reload`, `invoke tool`, `open surface`, or `run scenario`.
5. myhanako records each action and resulting diagnostics as evidence.
6. User sees a before/after summary and can expand raw technical details.

Acceptance:

- A plugin developer can reload and smoke-test one dev plugin without leaving myhanako.
- Every action has an evidence record.
- Failed loads explain the likely failing stage and next action.

### Flow 2: Workflow Review

Purpose: lower the cost of participating in the agent loop.

Steps:

1. User selects a HanaAgent session or workflow attempt.
2. myhanako builds a Workflow Timeline from session, prompt, tool, plugin, permission, and pipeline evidence.
3. UI shows three layers:
   - What happened.
   - Why it likely happened.
   - What the user can adjust.
4. User gives natural-language feedback, such as "next time read the project docs before web search."
5. myhanako turns the feedback into a reviewable workflow adjustment draft.
6. User confirms, edits, or discards the adjustment.

Acceptance:

- A non-developer can understand at least one concrete reason a result failed.
- The system never silently saves a behavior-changing adjustment.
- A developer can expand the same review into full evidence.

### Flow 3: Tool and Schema Inspection

Purpose: explain which capabilities HanaAgent exposed to the model.

Steps:

1. User selects a session turn or lab run.
2. myhanako shows internal tool definitions, source plugin/skill/builtin, active tool names, and provider-visible schema.
3. Developer can run a tool smoke test against lab input.
4. User can compare schema before and after plugin reload.

Acceptance:

- A developer can answer why a tool was available or missing.
- Schema differences are visible before and after reload.

### Flow 4: Plugin-Private Session Lab

Purpose: provide safe experimentation without mutating real user sessions.

Steps:

1. User creates a plugin-private lab session.
2. User injects per-turn context or chooses a plugin scenario.
3. HanaAgent executes the lab turn.
4. myhanako records prompt, tool, plugin, pipeline, and result evidence.
5. User can compare lab behavior against an attached real session.

Acceptance:

- Lab runs are clearly marked as synthetic.
- Lab runs do not change real session state unless the user explicitly uses a future intervention mode.

### Flow 5: Evidence Bundle Export

Purpose: support debugging and collaboration.

Steps:

1. User selects a session, plugin run, or workflow attempt.
2. myhanako exports redacted evidence including version matrix, action log, diagnostics, tool schema, prompt hashes, and key raw records.
3. User can attach the bundle to an issue or review it locally.

Acceptance:

- Export does not include secrets by default.
- Bundle includes enough version and adapter data to reproduce compatibility issues.

## System Architecture

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

HanaAgent remains the source of truth for:

- sessions;
- tools;
- prompts;
- plugins;
- providers;
- permissions;
- automation;
- task execution;
- files;
- terminal;
- frontend product surfaces.

myhanako must not reimplement these responsibilities.

### myhanako Full-Access Plugin

Responsibilities:

- provide Hana embedded entry points;
- subscribe to session and runtime events;
- call Hana EventBus capabilities;
- expose plugin routes for myhanako bridge/status APIs;
- observe pipeline events through full-access extensions;
- support lab actions through Hana plugin dev APIs when available;
- forward normalized evidence to myhanako core.

Constraints:

- default mode is observe;
- lab mode requires explicit activation;
- real-session intervention is out of P1;
- pipeline rewrite is out of P1 except as a future gated experiment.

### Hana Adapter Layer

Responsibilities:

- isolate current Hana plugin protocol and EventBus shapes;
- map Hana payloads into myhanako evidence records;
- provide capability discovery;
- degrade gracefully when a Hana capability is unavailable or experimental.

Adapter ports:

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

Responsibilities:

- ingest evidence records;
- persist append-only raw records;
- generate projections;
- build workflow explanations;
- manage redaction;
- manage lab action history;
- expose query APIs to UI shells.

Core must not import HanaAgent internal modules.

### UI Shells

Hana embedded UI:

- quick access from HanaAgent;
- current session/plugin context;
- compact workflow review;
- quick plugin lab actions.

Standalone UI:

- full evidence browser;
- plugin lab workspace;
- evidence bundle export;
- compatibility diagnostics.

Both shells consume the same sidecar/core API.

## Evidence Protocol

P1 should define a small stable envelope plus five typed evidence families.

### Envelope

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

### Typed Families

P1 typed families:

- `PluginEvidence`
- `ToolEvidence`
- `PromptEvidence`
- `PipelineEvidence`
- `SessionEventEvidence`

Other records may be stored as raw evidence until they become stable enough for typed projection.

## Workflow Model

P1 should not expose raw traces as the default user experience.

Workflow Review projection:

```text
Goal
  -> Steps attempted
  -> Tools/plugins used
  -> Inputs and context used
  -> Failure or uncertainty points
  -> Suggested adjustments
  -> Saved preferences or recipe draft
```

Adjustment draft:

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

P1 only creates drafts and records confirmations. It does not silently mutate HanaAgent behavior.

## Data Flow

### Plugin Lab Data Flow

```text
User action
  -> UI command
  -> myhanako core action request
  -> Hana adapter
  -> Hana plugin dev/runtime capability
  -> Hana result
  -> EvidenceEnvelope
  -> append-only log
  -> plugin lab projection
  -> UI summary
```

### Workflow Review Data Flow

```text
Session or workflow selection
  -> Hana adapter reads session projection and events
  -> evidence records normalized
  -> workflow projection built
  -> user-facing explanation generated
  -> optional adjustment draft
  -> user confirmation
  -> saved adjustment record
```

## API Design

P1 sidecar/core API should be local-first.

### `POST /v1/evidence`

Ingest one or more evidence records.

Request:

```json
{
  "records": []
}
```

Response:

```json
{
  "accepted": 0,
  "rejected": 0,
  "errors": []
}
```

### `GET /v1/sessions/{sessionId}/workflow-review`

Return user-facing workflow review projection.

### `GET /v1/plugins/{pluginId}/lab`

Return plugin lab status and diagnostics.

### `POST /v1/lab/actions`

Run an explicit lab action.

Allowed P1 actions:

- `plugin.install_dev`
- `plugin.reload_dev`
- `plugin.invoke_tool`
- `plugin.open_surface`
- `session.create_plugin_private`
- `session.send_lab_message`

### `POST /v1/workflow-adjustments/draft`

Create a reviewable workflow adjustment draft from user feedback.

### `POST /v1/workflow-adjustments/{draftId}/confirm`

Save a confirmed adjustment record.

P1 may store the adjustment record even if runtime enforcement is deferred.

### `POST /v1/evidence-bundles`

Create a redacted export bundle.

## State and Storage

P1 storage:

- append-only evidence log;
- projection cache;
- lab action history;
- compatibility snapshots;
- workflow adjustment drafts and confirmations.

Recommended initial storage:

- JSONL for append-only raw evidence;
- SQLite for indexes and projections when query complexity increases.

Storage rules:

- raw records are not migrated in place;
- projections can be rebuilt;
- every record includes schema and adapter versions;
- redaction is applied before export;
- local purge must be supported.

## Permissions and Security

P1 uses a full-access Hana plugin, so myhanako must add its own internal permission gates.

Internal domains:

- `observe`
- `lab`
- `route`
- `export`
- `pipeline`
- `intervention`

P1 enables:

- `observe`
- `lab`
- `route`
- `export`

P1 does not enable:

- real-session intervention;
- provider request rewrite;
- silent workflow mutation.

Rules:

- full-access plugin must be dev-visible;
- lab mode must be explicit;
- sidecar communication is localhost-only;
- sidecar token is generated per startup;
- secret fields are redacted by default;
- raw provider credentials, cookies, tokens, and private file contents are not exported by default;
- users can purge evidence data;
- lab runs are marked as synthetic;
- attached real sessions are read-only in P1.

## Failure Modes

### Hana Capability Missing

Behavior:

- mark feature as unavailable;
- keep UI usable;
- show compatibility explanation;
- do not crash core.

### Experimental Capability Changed

Behavior:

- feature-gate the capability;
- record adapter error evidence;
- show degraded mode.

### Sidecar Offline

Behavior:

- Hana plugin falls back to no-op or bounded local buffer;
- HanaAgent session continues normally.

### Evidence Normalization Fails

Behavior:

- store redacted raw event if safe;
- mark projection as partial;
- expose error in diagnostics.

### Lab Action Fails

Behavior:

- record failed lab action;
- show command, target, stage, and next suggested check;
- do not retry destructive actions automatically.

### User Feedback Produces Unsafe Adjustment

Behavior:

- draft is marked high risk;
- runtime save is blocked unless explicitly confirmed;
- P1 may store the draft but not enforce it.

## Testing Plan

### Unit Tests

- evidence envelope validation;
- redaction policy;
- plugin diagnostics normalizer;
- tool schema projection;
- workflow adjustment draft parser;
- compatibility matrix evaluation.

### Integration Tests

- load myhanako as a full-access dev plugin;
- read EventBus capabilities;
- subscribe to a session event stream;
- run plugin dev diagnostics through the adapter;
- run a plugin tool smoke test;
- create plugin-private session and send lab message;
- ingest evidence and rebuild workflow projection.

### Manual Acceptance

- Install or reload a dev plugin from myhanako.
- Invoke one plugin tool and see the evidence record.
- Attach to a real session and see read-only workflow review.
- Create one plugin-private lab session and run a prompt with injected context.
- Create one workflow adjustment draft from natural-language feedback.
- Export a redacted evidence bundle.

## Risks and Tradeoffs

### Risk: myhanako Becomes a HanaAgent Fork

Mitigation:

- no general chat client;
- no model/settings ownership;
- no marketplace replacement;
- HanaAgent remains executor.

### Risk: P1 Becomes Too Broad

Mitigation:

- P1 centers on Workflow Review + Plugin Lab only;
- file replay, terminal replay, memory graph, and real intervention stay out of P1.

### Risk: Full-Access Plugin Becomes Dangerous

Mitigation:

- internal permission domains;
- explicit lab mode;
- read-only real-session attachment;
- redaction;
- local-only sidecar.

### Risk: HanaAgent Changes Break myhanako

Mitigation:

- adapter layer owns Hana compatibility;
- core depends on evidence protocol;
- capability discovery on startup;
- rolling compatibility window.

### Risk: Normal Users Do Not Understand Evidence

Mitigation:

- default UI is Workflow Review, not raw trace;
- raw evidence is progressive disclosure;
- explanations use "what happened / why / what to adjust."

## Compatibility Policy

P1 should support:

- current active HanaAgent version;
- previous one or two active versions when practical;
- long-term readability of raw myhanako evidence logs.

P1 should not promise:

- indefinite compatibility with all historical HanaAgent versions;
- stable support for experimental Hana capabilities without adapter updates.

## Iteration Plan

### P1.0

- full-access myhanako plugin shell;
- Hana adapter capability discovery;
- plugin lab diagnostics;
- dev plugin reload/invoke smoke test;
- evidence envelope and append-only log;
- basic session workflow review;
- standalone UI and embedded Hana entry.

### P1.1

- plugin-private session lab;
- prompt/tool/pipeline evidence projections;
- workflow adjustment drafts;
- redacted evidence bundle export.

### P1.2

- workflow recipe storage;
- session compare;
- better natural-language adjustment review;
- compatibility dashboard.

### P2

- file and diff replay;
- terminal replay;
- memory provenance;
- controlled real-session intervention;
- provider/pipeline rewrite lab;
- cross-version regression bench.

## P1 Acceptance Criteria

P1 is successful when:

- A plugin developer can install or reload a dev plugin and test one tool inside myhanako.
- The resulting plugin/tool/session evidence is recorded and reviewable.
- A real Hana session can be attached read-only and summarized as a workflow review.
- A non-developer-facing explanation can identify at least one likely failure or improvement point.
- Natural-language feedback can become a reviewable workflow adjustment draft.
- The same evidence can be expanded into developer-level details.
- HanaAgent continues working if myhanako sidecar is closed.
- No P1 action silently mutates a real user session.

## Open Review Questions

- Should P1 store workflow adjustment drafts only in myhanako, or also write a Hana plugin-visible preference record?
- Which Hana plugin dev capability should be treated as the first supported backend for `PluginLabPort`?
- Should standalone UI be required before embedded UI, or can embedded UI ship first with a minimal standalone fallback?
- What is the minimum evidence bundle format needed for useful bug reports?
