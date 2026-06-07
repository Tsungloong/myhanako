# P1 Workflow Review and Plugin Lab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first myhanako P1 loop that connects to HanaAgent as a full-access plugin, records normalized evidence, and supports plugin lab diagnostics plus read-only workflow review.

**Architecture:** HanaAgent remains the executor and plugin host. myhanako enters through a full-access Hana plugin, isolates Hana compatibility in an adapter layer, forwards normalized evidence to a local sidecar/core, and serves both embedded and standalone UI shells from the same core API.

**Tech Stack:** TypeScript, Node.js >=24.12, Hono-compatible local HTTP API, JSONL append-only evidence log, Vitest, HanaAgent plugin runtime APIs documented in `F:\openhanako-main\PLUGIN_SDK.md` and `F:\openhanako-main\PLUGINS.md`.

---

## File Structure

- Create: `package.json` for scripts, TypeScript, and test dependencies.
- Create: `tsconfig.json` for shared TypeScript settings.
- Create: `src/shared/evidence.ts` for the stable P1 evidence envelope and typed validation.
- Create: `src/core/evidence-log.ts` for append-only JSONL writes and ordered reads.
- Create: `src/core/redaction.ts` for export redaction policy.
- Create: `src/hana/adapter.ts` for Hana capability discovery and plugin lab ports.
- Create: `src/hana/plugin/index.ts` for the full-access Hana plugin entry.
- Create: `src/server/api.ts` for local sidecar routes.
- Create: `tests/evidence.test.ts` for evidence validation and log ordering.
- Create: `tests/redaction.test.ts` for secret export behavior.
- Create: `tests/hana-adapter-contract.test.ts` for adapter degradation behavior.
- Modify: `docs/p1-reference.md` when an implementation detail becomes verified or rejected.

### Task 1: Project Skeleton

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `src/shared/evidence.ts`
- Test: `tests/evidence.test.ts`

- [ ] **Step 1: Create the failing evidence validation test**

```ts
import { describe, expect, it } from "vitest";
import { validateEvidenceEnvelope } from "../src/shared/evidence";

describe("validateEvidenceEnvelope", () => {
  it("accepts the minimum P1 evidence envelope", () => {
    const result = validateEvidenceEnvelope({
      schemaVersion: 1,
      eventId: "evt_001",
      eventType: "plugin.diagnostics.read",
      timestamp: "2026-06-07T00:00:00.000Z",
      sequence: 1,
      hanaVersion: "0.301.8",
      adapterVersion: "0.1.0",
      probeVersion: "0.1.0",
      source: { layer: "plugin", stability: "stable" },
      refs: { pluginId: "myhanako" },
      sensitivity: "internal",
      redaction: { applied: false, fields: [] },
      payload: { status: "ok" }
    });

    expect(result.ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npm test -- tests/evidence.test.ts`

Expected: FAIL because `src/shared/evidence.ts` does not exist.

- [ ] **Step 3: Add minimal package and TypeScript configuration**

```json
{
  "name": "myhanako",
  "version": "0.1.0",
  "type": "module",
  "private": true,
  "engines": {
    "node": ">=24.12.0 <25"
  },
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "typescript": "^5.9.3",
    "vitest": "^4.0.18"
  }
}
```

```json
{
  "compilerOptions": {
    "target": "ES2024",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "skipLibCheck": true,
    "types": ["node", "vitest"]
  },
  "include": ["src/**/*.ts", "tests/**/*.ts"]
}
```

- [ ] **Step 4: Implement the evidence envelope contract**

```ts
export type EvidenceLayer =
  | "session"
  | "plugin"
  | "tool"
  | "prompt"
  | "pipeline"
  | "permission"
  | "workflow"
  | "lab";

export type EvidenceSensitivity = "public" | "internal" | "secret-adjacent" | "secret";

export type EvidenceEnvelope = {
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
    layer: EvidenceLayer;
  };
  refs: {
    sessionPath?: string;
    turnId?: string;
    toolCallId?: string;
    pluginId?: string;
    labRunId?: string;
    workflowId?: string;
  };
  sensitivity: EvidenceSensitivity;
  redaction: {
    applied: boolean;
    fields: string[];
  };
  payload: unknown;
  rawSource?: unknown;
};

const layers = new Set<EvidenceLayer>(["session", "plugin", "tool", "prompt", "pipeline", "permission", "workflow", "lab"]);
const sensitivities = new Set<EvidenceSensitivity>(["public", "internal", "secret-adjacent", "secret"]);

export function validateEvidenceEnvelope(value: unknown): { ok: true; value: EvidenceEnvelope } | { ok: false; error: string } {
  if (!value || typeof value !== "object") return { ok: false, error: "Envelope must be an object" };
  const record = value as Record<string, any>;
  if (record.schemaVersion !== 1) return { ok: false, error: "schemaVersion must be 1" };
  for (const key of ["eventId", "eventType", "timestamp", "hanaVersion", "adapterVersion", "probeVersion"]) {
    if (typeof record[key] !== "string" || record[key].length === 0) return { ok: false, error: `${key} must be a non-empty string` };
  }
  if (!Number.isSafeInteger(record.sequence) || record.sequence < 1) return { ok: false, error: "sequence must be a positive safe integer" };
  if (!record.source || !layers.has(record.source.layer)) return { ok: false, error: "source.layer is invalid" };
  if (!record.refs || typeof record.refs !== "object") return { ok: false, error: "refs must be an object" };
  if (!sensitivities.has(record.sensitivity)) return { ok: false, error: "sensitivity is invalid" };
  if (!record.redaction || typeof record.redaction.applied !== "boolean" || !Array.isArray(record.redaction.fields)) {
    return { ok: false, error: "redaction is invalid" };
  }
  return { ok: true, value: record as EvidenceEnvelope };
}
```

- [ ] **Step 5: Run tests and commit**

Run: `npm test -- tests/evidence.test.ts`

Expected: PASS.

```bash
git add package.json tsconfig.json src/shared/evidence.ts tests/evidence.test.ts
git commit -m "feat: add P1 evidence envelope contract"
```

### Task 2: Append-Only Evidence Log

**Files:**
- Create: `src/core/evidence-log.ts`
- Test: `tests/evidence.test.ts`

- [ ] **Step 1: Add the failing append/read ordering test**

```ts
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { EvidenceLog } from "../src/core/evidence-log";

it("appends JSONL records and reads them in sequence order", async () => {
  const dir = await mkdtemp(join(tmpdir(), "myhanako-evidence-"));
  try {
    const log = new EvidenceLog(join(dir, "evidence.jsonl"));
    await log.append(makeEnvelope({ eventId: "evt_2", sequence: 2 }));
    await log.append(makeEnvelope({ eventId: "evt_1", sequence: 1 }));

    const records = await log.readAll();
    expect(records.map((record) => record.eventId)).toEqual(["evt_1", "evt_2"]);

    const raw = await readFile(join(dir, "evidence.jsonl"), "utf8");
    expect(raw.trim().split("\n")).toHaveLength(2);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npm test -- tests/evidence.test.ts`

Expected: FAIL because `EvidenceLog` does not exist.

- [ ] **Step 3: Implement JSONL append and ordered read**

```ts
import { mkdir, readFile, appendFile } from "node:fs/promises";
import { dirname } from "node:path";
import { EvidenceEnvelope, validateEvidenceEnvelope } from "../shared/evidence";

export class EvidenceLog {
  constructor(private readonly filePath: string) {}

  async append(record: EvidenceEnvelope): Promise<void> {
    const validation = validateEvidenceEnvelope(record);
    if (!validation.ok) throw new Error(validation.error);
    await mkdir(dirname(this.filePath), { recursive: true });
    await appendFile(this.filePath, `${JSON.stringify(record)}\n`, "utf8");
  }

  async readAll(): Promise<EvidenceEnvelope[]> {
    let raw = "";
    try {
      raw = await readFile(this.filePath, "utf8");
    } catch (error: any) {
      if (error?.code === "ENOENT") return [];
      throw error;
    }

    return raw
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => {
        const parsed = JSON.parse(line);
        const validation = validateEvidenceEnvelope(parsed);
        if (!validation.ok) throw new Error(validation.error);
        return validation.value;
      })
      .sort((a, b) => a.sequence - b.sequence);
  }
}
```

- [ ] **Step 4: Run tests and commit**

Run: `npm test -- tests/evidence.test.ts`

Expected: PASS.

```bash
git add src/core/evidence-log.ts tests/evidence.test.ts
git commit -m "feat: add append-only evidence log"
```

### Task 3: Redaction Policy

**Files:**
- Create: `src/core/redaction.ts`
- Test: `tests/redaction.test.ts`

- [ ] **Step 1: Write failing redaction tests**

```ts
import { describe, expect, it } from "vitest";
import { redactForExport } from "../src/core/redaction";

describe("redactForExport", () => {
  it("removes secret payload fields before export", () => {
    const record = makeEnvelope({
      eventId: "evt_secret",
      sensitivity: "secret-adjacent",
      payload: {
        apiKey: "sk-test",
        cookie: "session=abc",
        visible: "diagnostic"
      }
    });

    const redacted = redactForExport(record);
    expect(redacted.payload).toEqual({
      apiKey: "[REDACTED]",
      cookie: "[REDACTED]",
      visible: "diagnostic"
    });
    expect(redacted.redaction.applied).toBe(true);
    expect(redacted.redaction.fields).toEqual(["payload.apiKey", "payload.cookie"]);
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npm test -- tests/redaction.test.ts`

Expected: FAIL because `src/core/redaction.ts` does not exist.

- [ ] **Step 3: Implement the first redaction pass**

```ts
import { EvidenceEnvelope } from "../shared/evidence";

const secretKeys = new Set(["apiKey", "api_key", "token", "cookie", "authorization", "password", "secret"]);

export function redactForExport(record: EvidenceEnvelope): EvidenceEnvelope {
  const fields: string[] = [];
  const payload = redactValue(record.payload, "payload", fields);
  return {
    ...record,
    payload,
    rawSource: record.rawSource === undefined ? undefined : "[REDACTED]",
    redaction: {
      applied: fields.length > 0 || record.rawSource !== undefined,
      fields: record.rawSource === undefined ? fields : [...fields, "rawSource"]
    }
  };
}

function redactValue(value: unknown, path: string, fields: string[]): unknown {
  if (Array.isArray(value)) return value.map((item, index) => redactValue(item, `${path}.${index}`, fields));
  if (!value || typeof value !== "object") return value;
  const result: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (secretKeys.has(key.toLowerCase())) {
      result[key] = "[REDACTED]";
      fields.push(`${path}.${key}`);
    } else {
      result[key] = redactValue(child, `${path}.${key}`, fields);
    }
  }
  return result;
}
```

- [ ] **Step 4: Run tests and commit**

Run: `npm test -- tests/redaction.test.ts`

Expected: PASS.

```bash
git add src/core/redaction.ts tests/redaction.test.ts
git commit -m "feat: redact evidence exports"
```

### Task 4: Hana Adapter Contract

**Files:**
- Create: `src/hana/adapter.ts`
- Test: `tests/hana-adapter-contract.test.ts`

- [ ] **Step 1: Write failing degradation test**

```ts
import { describe, expect, it } from "vitest";
import { createHanaAdapter } from "../src/hana/adapter";

describe("createHanaAdapter", () => {
  it("marks plugin dev capabilities unavailable when EventBus lacks handlers", async () => {
    const adapter = createHanaAdapter({
      hanaVersion: "0.301.8",
      bus: {
        getCapability: () => null,
        request: async () => {
          throw new Error("missing handler");
        }
      }
    });

    const diagnostics = await adapter.readPluginDiagnostics({ pluginId: "demo" });
    expect(diagnostics.available).toBe(false);
    expect(diagnostics.reason).toBe("plugin.dev.diagnostics unavailable");
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npm test -- tests/hana-adapter-contract.test.ts`

Expected: FAIL because `src/hana/adapter.ts` does not exist.

- [ ] **Step 3: Implement capability-aware adapter**

```ts
export type HanaBus = {
  getCapability?: (type: string) => { available?: boolean } | null;
  request: (type: string, input: unknown) => Promise<unknown>;
};

export type HanaAdapterInput = {
  hanaVersion: string;
  bus: HanaBus;
};

export type PluginDiagnosticsResult = {
  available: boolean;
  reason?: string;
  payload?: unknown;
};

export function createHanaAdapter(input: HanaAdapterInput) {
  return {
    async readPluginDiagnostics(args: { pluginId: string }): Promise<PluginDiagnosticsResult> {
      const capability = input.bus.getCapability?.("plugin.dev.diagnostics");
      if (!capability?.available) {
        return { available: false, reason: "plugin.dev.diagnostics unavailable" };
      }
      try {
        const payload = await input.bus.request("plugin.dev.diagnostics", args);
        return { available: true, payload };
      } catch (error: any) {
        return { available: false, reason: error?.message || "plugin.dev.diagnostics failed" };
      }
    }
  };
}
```

- [ ] **Step 4: Run tests and commit**

Run: `npm test -- tests/hana-adapter-contract.test.ts`

Expected: PASS.

```bash
git add src/hana/adapter.ts tests/hana-adapter-contract.test.ts
git commit -m "feat: add Hana adapter capability checks"
```

### Task 5: Sidecar API Smoke Route

**Files:**
- Create: `src/server/api.ts`
- Test: `tests/evidence.test.ts`

- [ ] **Step 1: Add failing API contract test**

```ts
import { createMyhanakoApi } from "../src/server/api";

it("accepts evidence records through POST /v1/evidence", async () => {
  const app = createMyhanakoApi({ evidenceLog: { append: async () => undefined } });
  const response = await app.request("/v1/evidence", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ records: [makeEnvelope({ eventId: "evt_api" })] })
  });

  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toEqual({ accepted: 1, rejected: 0, errors: [] });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npm test -- tests/evidence.test.ts`

Expected: FAIL because `src/server/api.ts` does not exist.

- [ ] **Step 3: Implement the local API route**

```ts
import { Hono } from "hono";
import { EvidenceEnvelope, validateEvidenceEnvelope } from "../shared/evidence";

export function createMyhanakoApi(deps: { evidenceLog: { append(record: EvidenceEnvelope): Promise<void> } }) {
  const app = new Hono();

  app.post("/v1/evidence", async (c) => {
    const body = await c.req.json().catch(() => null);
    const records = Array.isArray(body?.records) ? body.records : [];
    const errors: string[] = [];
    let accepted = 0;

    for (const record of records) {
      const validation = validateEvidenceEnvelope(record);
      if (!validation.ok) {
        errors.push(validation.error);
        continue;
      }
      await deps.evidenceLog.append(validation.value);
      accepted += 1;
    }

    return c.json({ accepted, rejected: records.length - accepted, errors });
  });

  return app;
}
```

- [ ] **Step 4: Add Hono dependency and run tests**

Run: `npm install hono --save`

Run: `npm test -- tests/evidence.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src/server/api.ts tests/evidence.test.ts
git commit -m "feat: expose evidence ingest API"
```

### Task 6: Documentation Update After First Green Loop

**Files:**
- Modify: `docs/p1-reference.md`
- Modify: `docs/2026-06-07-myhanako-p1-workflow-review-plugin-lab-design.md`

- [ ] **Step 1: Record verified implementation status**

Add this section to `docs/p1-reference.md` after `## P1 第一批工程入口`:

```md
## P1 已验证实现

- Evidence envelope validation is implemented in `src/shared/evidence.ts`.
- Append-only JSONL evidence storage is implemented in `src/core/evidence-log.ts`.
- Export redaction is implemented in `src/core/redaction.ts`.
- Hana adapter capability degradation is implemented in `src/hana/adapter.ts`.
- Local evidence ingest route is implemented in `src/server/api.ts`.
```

- [ ] **Step 2: Run verification**

Run: `npm test`

Expected: PASS.

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add docs/p1-reference.md docs/2026-06-07-myhanako-p1-workflow-review-plugin-lab-design.md
git commit -m "docs: record P1 evidence loop status"
```

## Self-Review Notes

- Spec coverage: This plan covers the first P1 engineering loop only: evidence envelope, append-only log, redaction, Hana adapter capability checks, and evidence ingest API. Plugin UI, embedded Hana page, standalone UI, workflow adjustment persistence, plugin-private session lab, and evidence bundle export remain follow-up plans.
- Placeholder scan: No unresolved placeholder markers or generic "add tests" steps are present.
- Type consistency: `EvidenceEnvelope`, `validateEvidenceEnvelope`, `EvidenceLog`, `redactForExport`, `createHanaAdapter`, and `createMyhanakoApi` are introduced before later tasks reference them.
