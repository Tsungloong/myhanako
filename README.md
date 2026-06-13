# myhanako

English README for tools, automation, and coding agents. For the Chinese
human-readable version, see [README.zh-CN.md](README.zh-CN.md).

## Overview

`myhanako` is a HanaAgent workflow companion and runtime lab. It does not fork
or replace HanaAgent. HanaAgent remains responsible for real execution,
sessions, tools, models, plugins, permissions, and the desktop product surface.

`myhanako` focuses on review, explanation, controlled experimentation,
evidence recording, workflow adjustment drafts, and redacted evidence export.

## Current Status

The project is in P1: `Workflow Review + Plugin Lab`.

Implemented and verified so far:

- P0 historical primitives: session event contracts, append-only
  `SessionEventLog`, `PromptBundle`, and prompt assembly evidence.
- P1 first closeout: evidence envelope, append-only evidence log, redaction
  policy, Hana diagnostics adapter, evidence ingest handler, Hana full-access
  plugin manifest, status route, diagnostics evidence, and read-only workflow
  review projection.
- P1 Task 19-30 closeout: controlled Plugin Lab actions, plugin-private lab
  session creation, workflow adjustment drafts, and redacted evidence bundle
  export.
- P1 Task 31-37 closeout: standalone UI, Hana embedded UI, Workflow Review
  page, Plugin Lab page, empty/error states, MVP smoke script, and internal
  testing documentation.

## Verified Hana Smoke

Verified against a running HanaAgent `0.310.1` process on 2026-06-13:

- `myhanako` dev plugin reload succeeded and the plugin remained `loaded`.
- `POST /api/plugins/myhanako/lab/actions` with `plugin.list_surfaces`
  completed via `plugin.dev.listSurfaces`, returned one surface, and wrote
  `lab.action.completed` evidence.
- `POST /api/plugins/myhanako/lab/actions` with
  `session.create_plugin_private` completed via `session:create`, returned
  `visibility: "plugin_private"`, `ownerPluginId: "myhanako"`, and
  `kind: "myhanako.lab"`, and wrote evidence.
- `plugin.dev.invokeTool` is reachable. Invoking a missing tool returned
  `PLUGIN_DEV_TOOL_NOT_FOUND`, which is expected because this repo does not yet
  contribute a real tool.

`session.send_lab_message` is implemented and covered by tests, but it was not
executed against the live HanaAgent process because `session:send` may trigger
model execution.

## Architecture

```text
HanaAgent Runtime
  -> myhanako full-access plugin
    -> Hana adapter layer
      -> evidence protocol and append-only log
        -> workflow review, lab actions, drafts, and export APIs
```

Important boundaries:

- Core modules must not import HanaAgent private runtime modules.
- Hana integration goes through the plugin route context and EventBus adapter.
- Mutating lab actions require explicit `labMode: true`.
- Workflow adjustment feedback creates drafts only; it does not silently execute
  workflow changes.
- Evidence export must redact secrets, credential-like strings, private keys,
  cookies, and local user path segments.

## Directory Guide

- `src/shared/evidence.ts`: P1 evidence envelope type and validation.
- `src/core/evidence-log.ts`: append-only JSONL evidence log.
- `src/core/redaction.ts`: redaction policy for export and persisted lab
  evidence.
- `src/core/workflow-review.ts`: read-only workflow review projection.
- `src/core/workflow-adjustments.ts`: workflow adjustment draft store and
  feedback-to-draft mapping.
- `src/core/evidence-bundle.ts`: redacted evidence bundle export.
- `src/hana/adapter.ts`: Hana EventBus adapter for diagnostics, dev plugin
  actions, surfaces, and plugin-private sessions.
- `src/hana/plugin/index.ts`: Plugin Lab orchestration and evidence writing.
- `src/hana/plugin/routes/status.ts`: Hana plugin routes for `/status` and
  `/lab/actions`.
- `src/ui/app-shell.ts`: reusable standalone/embedded UI shell renderer.
- `assets/`: static browser assets for the P1 MVP UI.
- `scripts/p1-mvp-smoke.mjs`: P1 MVP smoke check for UI assets, embedded route,
  core lab action API, workflow review, drafts, bundle export, and docs.
- `routes/status.ts`: root route wrapper used by Hana dev plugin loading.
- `src/server/api.ts`: local core handler for evidence ingest, workflow review,
  lab actions, drafts, and bundles.
- `tests/`: Node test coverage for contracts, API handlers, P1 fixture loops,
  lab actions, drafts, bundles, UI shell, and MVP smoke.
- `docs/p1-task-19-30-closeout.md`: Chinese closeout record for Task 19-30.
- `docs/p1-mvp-internal-test.md`: Chinese internal test guide for Task 31-37.

## Hana Dev Plugin

The root `manifest.json` is the Hana dev plugin descriptor. Install or reload
the repository root as the plugin source, not `src/hana/plugin`.

Hana dev source paths may need to be under:

```text
${HANA_HOME}/plugin-dev-sources/
```

In the verified local smoke, the source was synced to:

```text
${HANA_HOME}/plugin-dev-sources/myhanako-smoke
```

## Local Commands

Install dependencies:

```powershell
npm install
```

Run all tests:

```powershell
npm test
```

Run type checking:

```powershell
npm run typecheck
```

Check whitespace in the diff:

```powershell
git diff --check
```

Recommended full verification:

```powershell
npm run smoke:p1-mvp
npm test
npm run typecheck
git diff --check
```

## API Summary

Local core handler routes:

- `POST /v1/evidence`
- `GET /v1/sessions/{sessionId}/workflow-review`
- `GET /v1/plugins/{pluginId}/lab`
- `POST /v1/lab/actions`
- `POST /v1/workflow-adjustments/draft`
- `GET /v1/workflow-adjustments/{draftId}`
- `POST /v1/workflow-adjustments/{draftId}/confirm`
- `POST /v1/evidence-bundles`

Hana plugin routes:

- `GET /api/plugins/myhanako/status` without `pluginId`: embedded UI.
- `GET /api/plugins/myhanako/status?pluginId={pluginId}`: diagnostics JSON.
- `POST /api/plugins/myhanako/lab/actions`

Standalone UI entry:

- `assets/standalone.html`

## Safety Notes

- Do not run mutating Plugin Lab actions without explicit `labMode: true`.
- Do not silently modify real user sessions.
- Do not export raw evidence without redaction.
- Do not put secrets, private config, or runtime data under plugin `assets/`.
- Treat Hana dev APIs as experimental and verify against the active HanaAgent
  version before relying on behavior.

## Current Verification

Latest verified command set:

```powershell
npm run smoke:p1-mvp
npm test
npm run typecheck
git diff --check
```
