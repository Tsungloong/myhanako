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

即使是个人私有仓库，也按 PR 习惯组织变更：

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

具体命令以后以项目脚本为准。

## 5. GitHub 仓库设置

目标远程仓库：

```text
Tsungloong/myhanako
```

推荐设置：

- 仓库可见性：private。
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
