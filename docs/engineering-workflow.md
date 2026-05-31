# 工程流程

本文档定义本项目的个人企业级开发流程。实际实现必须服从 [design.md](design.md) 的架构约束。

## 1. 分支模型

- `main`：稳定基线分支，只放已审核、可追溯的提交。
- `plan/*`：计划、架构拆解和工程准备分支。
- `feat/*`：功能开发分支。
- `fix/*`：缺陷修复分支。
- `docs/*`：文档变更分支。
- `release/*`：发布准备分支。

当前阶段建议：

- `main` 保存架构和流程基线。
- `plan/p0-implementation` 用于拆 P0 任务和准备第一批工程骨架。
- P0 代码实现从 `feat/p0-event-log` 开始。

## 2. 提交规范

采用简洁的 Conventional Commits：

- `docs:` 文档。
- `feat:` 新功能。
- `fix:` 修复。
- `refactor:` 不改变行为的结构调整。
- `test:` 测试。
- `chore:` 工程配置、依赖、脚本。

示例：

```text
docs: establish PiAgent architecture baseline
feat: add append-only session event log
test: cover terminal output normalization
```

每个提交应保持单一意图。不要把架构文档、格式化、依赖升级和功能实现混在同一个提交里。

## 3. PR 审核规则

即使是个人公开仓库，也按 PR 习惯组织变更：

- PR 必须说明对应的设计章节或计划里程碑。
- PR 必须列出行为变化和验证方式。
- 涉及核心协议、事件、记忆、文件写入、终端、安全边界的 PR 必须有测试。
- 涉及桌面 UI 的 PR 必须有截图或录屏验证。
- 不允许把未进入 `docs/design.md` 的早期材料作为 PR 依据。

## 4. 本地开发检查

提交前至少执行：

```powershell
git status --short
git diff --check
```

进入代码阶段后，应补充项目实际命令，例如：

```powershell
npm test
npm run lint
npm run typecheck
```

当前已有脚本：

```powershell
npm test
```

后续补充 lint、typecheck 或 build 后，以 `package.json` 脚本为准。

## 4.1 维护节奏

- 每个可验证的小里程碑形成单一意图提交。
- 每次提交前必须运行当前项目验证命令，并在 PR 或开发记录中标注。
- 功能分支应定期推送到远程，避免本地单点状态。
- 每条功能分支优先建立 draft PR 作为维护入口；如果本机认证或 GitHub App 权限阻塞，应在开发记录中说明。
- 实施状态记录可以写入 `docs/p0-progress.md`，但不能替代 `docs/design.md` 的架构基准地位。

## 4.2 GitHub / 远程维护故障处理

当前 Codex 桌面会话中，GitHub 连接器、`gh` CLI 和 Git transport 可能分别受到权限、审批超时或网络限制影响。遇到远程分支、PR metadata、push、fetch 或 PR edit 阻塞时，按以下顺序处理：

1. 先执行只读本地检查，确认当前分支、工作树、最近提交和远端配置。
2. 如果常规指令不可用，直接换已知可用路径，例如 GitHub 连接器、`gh` CLI 或带 GitHub CLI credential helper 的 HTTPS Git。
3. 需要权限时立即请求用户提权，不反复尝试同一条失败命令。
4. 如果连接器、`gh` CLI 和 Git transport 都不可用，停止自动重试，汇报失败点、当前仓库状态和用户可手动执行的 Git/GitHub 命令路径。
5. 不为了绕过权限限制而改用不透明脚本、删除本地状态、force push、reset 或 stash 用户变更。

## 5. GitHub 仓库设置

目标远程仓库：

```text
Tsungloong/myhanako
```

推荐设置：

- 仓库可见性：public。
- 默认分支：`main`。
- 开启 branch protection，至少保护 `main`。
- 禁止直接 force push 到 `main`。
- 合并策略优先 squash merge 或 rebase merge。
- 使用 GitHub Issues 跟踪 P0/P1/P2/P3 任务。

## 6. Issue 组织

建议标签：

- `phase:p0`
- `phase:p1`
- `phase:p2`
- `phase:p3`
- `area:core`
- `area:server`
- `area:hub`
- `area:desktop`
- `area:memory`
- `area:plugin-skill`
- `area:terminal`
- `area:diff`
- `area:security`

P0 初始 issue 建议：

- P0 shared event contract。
- P0 append-only SessionEventLog。
- P0 PromptBundle and PromptAssembler。
- P0 plugin/skill manager skeleton。
- P0 visible memory minimum loop。
- P0 workspace patch and diff model。
- P0 terminal event stream。
- P0 HTTP API and WebSocket event stream。
