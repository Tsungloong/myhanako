# P1 Workflow Review + Plugin Lab 实施计划

日期：2026-06-07
事实源入口：[p1-reference.md](p1-reference.md)
设计基准：[p1-design.md](p1-design.md)

## 目标

实现 myhanako P1 第一条可验证闭环：作为 HanaAgent full-access plugin 接入，完成 Hana capability discovery、evidence envelope、append-only evidence log、plugin lab diagnostics 和 read-only workflow review projection。dev plugin reload/invoke smoke test 放入第二批，避免第一批同时承担诊断闭环和执行闭环。

## 约束

- 不覆盖当前 `shared/*` 未提交改动。
- 不把 myhanako 做成 HanaAgent chat fork。
- 不依赖 HanaAgent renderer store 或 React component。
- 不静默修改真实 Hana session。
- 所有会改变行为的 workflow adjustment 只生成 draft，必须等待确认。
- 所有 HanaAgent 接口和版本事实必须从目标 commit 重新核对。

## 文件规划

第一批代码建议新增：

- `src/shared/evidence.ts`：P1 evidence envelope 类型与验证。
- `src/core/evidence-log.ts`：append-only JSONL evidence log。
- `src/core/redaction.ts`：export redaction policy。
- `src/hana/adapter.ts`：Hana capability discovery 与 adapter ports。
- `src/hana/plugin/index.ts`：myhanako full-access Hana plugin entry。
- `manifest.json`：Hana dev plugin source root descriptor。
- `routes/status.ts`：Hana plugin route wrapper，转发到 `src/hana/plugin/routes/status.ts`。
- `src/server/api.ts`：local sidecar/core API。
- `tests/evidence.test.ts`：evidence validation 与 log ordering。
- `tests/redaction.test.ts`：secret export behavior。
- `tests/hana-adapter-contract.test.ts`：adapter unavailable/degraded behavior。
- `tests/p1-diagnostics-loop.test.ts`：Hana plugin diagnostics evidence 收口 fixture。

文档维护：

- 修改 `docs/p1-reference.md` 记录已验证实现和待确认项变化。
- 修改 `docs/p1-design.md` 只记录设计级变化，不记录临时代码细节。

## Task 1：核对 HanaAgent 插件事实

步骤：

1. 读取 `F:\openhanako-main\package.json`，记录目标版本、Node engine、关键依赖版本。
2. 读取 `F:\openhanako-main\PLUGIN_SDK.md` 中 dev loop、EventBus、plugin-private sessions、extensions、pages/widgets 章节。
3. 读取 `F:\openhanako-main\PLUGINS.md` 中 dev plugin loop 与 HTTP route 章节。
4. 读取 `F:\openhanako-main\core\plugin-dev-service.ts`、`core\plugin-context.ts`、`server\routes\plugins.ts` 的相关实现。
5. 把已核对结果写入 `docs/p1-reference.md`，不要写入未确认接口。

验证：

```powershell
rg -n "plugin.dev.install|plugin.dev.reload|plugin.dev.invokeTool|plugin.dev.diagnostics|plugin_private|listSurfaces" F:\openhanako-main\PLUGIN_SDK.md F:\openhanako-main\PLUGINS.md F:\openhanako-main\core F:\openhanako-main\server
git diff --check
```

## Task 2：建立 P1 evidence envelope

步骤：

1. 新增 `tests/evidence.test.ts`，先写最小 envelope validation 测试。
2. 新增 `src/shared/evidence.ts`，定义 `EvidenceEnvelope`、`EvidenceLayer`、`EvidenceSensitivity` 和 `validateEvidenceEnvelope`。
3. 运行测试，确认失败原因从“文件不存在”变成通过。
4. 补充非法 layer、非法 sensitivity、非法 sequence 的测试。

验证：

```powershell
npm test -- tests/evidence.test.ts
npm run typecheck
git diff --check
```

## Task 3：实现 append-only evidence log

步骤：

1. 在 `tests/evidence.test.ts` 增加 JSONL append/read ordering 测试。
2. 新增 `src/core/evidence-log.ts`。
3. `append(record)` 必须先调用 `validateEvidenceEnvelope`。
4. `readAll()` 必须按 `sequence` 返回。
5. 不做 in-place migration；projection 可后续重建。

验证：

```powershell
npm test -- tests/evidence.test.ts
npm run typecheck
git diff --check
```

## Task 4：实现 redaction policy

步骤：

1. 新增 `tests/redaction.test.ts`，覆盖 `apiKey`、`api_key`、`token`、`cookie`、`authorization`、`password`、`secret`。
2. 新增 `src/core/redaction.ts`。
3. `rawSource` 默认导出为 `[REDACTED]`。
4. `redaction.applied` 和 `redaction.fields` 必须准确记录。

验证：

```powershell
npm test -- tests/redaction.test.ts
npm run typecheck
git diff --check
```

## Task 5：实现 Hana adapter 降级契约

步骤：

1. 新增 `tests/hana-adapter-contract.test.ts`，覆盖 EventBus capability 缺失时 `readPluginDiagnostics` 返回 unavailable。
2. 新增 `src/hana/adapter.ts`。
3. 第一版只实现 capability discovery 和 `readPluginDiagnostics`，不要提前实现所有 lab actions。
4. 错误必须返回结构化 reason，不抛到 UI。

验证：

```powershell
npm test -- tests/hana-adapter-contract.test.ts
npm run typecheck
git diff --check
```

## Task 6：实现 sidecar evidence ingest API

步骤：

1. 新增 `src/server/api.ts`。
2. 提供 `POST /v1/evidence`，请求体为 `{ "records": [] }`。
3. 对每条 record 调用 `validateEvidenceEnvelope`。
4. 返回 `{ accepted, rejected, errors }`。
5. API 必须只依赖 core interface，不直接 import HanaAgent。

验证：

```powershell
npm test
npm run typecheck
git diff --check
```

## Task 7：Plugin Lab 第一条闭环

步骤：

1. 新增 `src/hana/plugin/index.ts` 作为 full-access plugin entry。
2. 读取 Hana EventBus capability directory。
3. 调用 adapter `readPluginDiagnostics`。
4. 把 diagnostics 结果转成 `PluginEvidence` envelope。
5. 写入 evidence log。
6. API 返回 plugin lab status。

验收：

- Hana capability 缺失时，UI/API 返回 unavailable，不 crash。
- diagnostics 成功时，有一条 `plugin.diagnostics.read` evidence。
- sidecar 关闭时，HanaAgent 不受影响。

验证：

```powershell
npm test
npm run typecheck
git diff --check
```

## Task 8：Read-only workflow review projection

步骤：

1. 从 evidence log 构建最小 workflow projection。
2. Projection 字段包含 `goal`、`stepsAttempted`、`toolsAndPluginsUsed`、`contextUsed`、`uncertaintyPoints`、`suggestedAdjustments`。
3. 提供 `GET /v1/sessions/{sessionId}/workflow-review`。
4. 如果 evidence 不完整，返回 `partial: true` 和原因。

验收：

- 真实 session attachment 在 P1 中只读。
- 非开发者视图不默认暴露 raw evidence。
- 开发者可以从 projection 展开 evidence refs。

验证：

```powershell
npm test
npm run typecheck
git diff --check
```

## Task 9-18：第一批收口

本段用于把 Task 1-8 的 contract/core 骨架接成第一批可验证闭环，范围限于 diagnostics evidence，不进入 UI、reload/invoke、plugin-private session 或 workflow adjustment draft。

| Task | 收口产出 | 验收证据 |
| ---: | --- | --- |
| 9 | 根目录 `manifest.json` 声明 `myhanako` full-access plugin，`activationEvents` 为 `onStartup`，page route 为 `/status`。 | `tests/p1-diagnostics-loop.test.ts` 读取 manifest 并断言 descriptor。 |
| 10 | 根目录 `routes/status.ts` 作为 Hana route wrapper；`src/hana/plugin/routes/status.ts` 注册 `/status`，响应区分 `hostPluginId` 与 `targetPluginId`。 | route fixture 断言 `/status` 可返回结构化状态，`pluginId` 表示被诊断目标。 |
| 11 | `createHanaEventBusAdapter(ctx)` 把 Hana plugin context `ctx.bus` 绑定到 `HanaAdapter`。 | fixture 通过 fake Hana EventBus 调用 `plugin.dev.diagnostics`。 |
| 12 | `createLogBackedPluginLab()` 串联 adapter、diagnostics run 和 `EvidenceLog`；route 在有 `ctx.bus` 与 `ctx.dataDir` 时自动构建 log-backed lab。 | fixture 断言 `plugin.diagnostics.read` 写入 JSONL evidence log；route fixture 断言真实 ctx fallback 可写入 `ctx.dataDir/evidence.jsonl`。 |
| 13 | sidecar 不可用时 route/status fail-open，返回 `degraded`，不向外抛异常。 | `createPluginRouteStatus()` 和 route fixture 覆盖 `sidecar unavailable`。 |
| 14 | workflow review API 可从同一个 JSONL log 读取 plugin diagnostics evidence refs。 | fixture 先写 workflow goal/step，再运行 diagnostics，再从 `/workflow-review` 读回 refs。 |
| 15 | diagnostics 写入路径接入 redaction，`rawSource` 默认遮蔽，敏感字段和日志字符串中的常见 credential 形态写入 `[REDACTED]`。 | fixture 覆盖 `apiKey` redaction 和 `redaction.fields`；`tests/redaction.test.ts` 覆盖 `Authorization: Bearer ...` 与 `api_key=...`。 |
| 16 | route/status 不调用 Hana session mutation 能力；当前第一批只读；并发 diagnostics run 的 `eventId`、`labRunId`、`sequence` 由 log-backed queue 串行分配。 | route fixture 只提供 query/json fake context，无 session bus 依赖；并发 fixture 断言 `_1`、`_2` 单调分配。 |
| 17 | 文档同步第一批收口状态和边界。 | `docs/p1-reference.md`、本文件、`README.md` 更新。 |
| 18 | 第一批验收命令通过。 | `npm test`、`npm run typecheck`、`git diff --check`。 |

待外部确认：这一阶段已有 Hana route/adapter/evidence fixture，但尚未在实际 HanaAgent 进程中执行 `plugin.dev.install` 和 `/api/plugins/myhanako/status` smoke。真实 Hana app smoke 需要在目标 HanaAgent commit/version 固定后执行。

## 第一批完成标准

第一批 P1 代码完成时必须满足：

- `npm test` 通过。
- `npm run typecheck` 通过。
- `git diff --check` 通过。
- `docs/p1-reference.md` 已记录实际核对的 HanaAgent 版本和接口事实。
- `tests/p1-diagnostics-loop.test.ts` 覆盖 manifest、Hana EventBus adapter binding、diagnostics evidence 写入、workflow review 同 log 回读和 sidecar fail-open。
- myhanako 没有任何 action 静默修改真实 Hana session。
- 当前 `shared/*` 未提交改动没有被覆盖或回滚。

## 后续计划

第一批完成后，再拆第二批计划：

- dev plugin reload/invoke smoke test。
- plugin-private session lab。
- workflow adjustment drafts。
- redacted evidence bundle export。
- Hana embedded UI。
- standalone UI。
