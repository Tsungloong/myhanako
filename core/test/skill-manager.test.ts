import assert from "node:assert/strict"
import test from "node:test"
import { PromptAssembler } from "../src/prompt-assembler.ts"
import { SkillManager } from "../src/skill-manager.ts"

test("SkillManager resolves bound skills as prompt layers without slash command exposure", () => {
  const manager = new SkillManager()
  manager.loadSkill({
    id: "compatibility_first",
    name: "Compatibility First",
    version: "1",
    source: "builtin",
    priority: 30,
    defaultEnabled: false,
    editable: false,
    content: "Prefer compatibility before platform-specific enhancements."
  })
  manager.loadSkill({
    id: "teaching_voice",
    name: "Teaching Voice",
    version: "1",
    source: "user",
    priority: 40,
    defaultEnabled: true,
    editable: true,
    content: "Explain implementation tradeoffs when teaching mode is active."
  })

  manager.bindSkill({
    skillId: "compatibility_first",
    scope: "project",
    scopeId: "myhanako",
    enabled: true
  })
  manager.bindSkill({
    skillId: "teaching_voice",
    scope: "session",
    scopeId: "session_1",
    enabled: false
  })

  const promptContext = manager.resolvePromptContext({
    sessionId: "session_1",
    projectId: "myhanako",
    mode: "code"
  })

  assert.deepEqual(promptContext.enabledSkillIds, ["compatibility_first"])
  assert.deepEqual(
    promptContext.layers.map((layer) => ({
      id: layer.id,
      source: layer.source,
      priority: layer.priority,
      enabled: layer.enabled,
      editable: layer.editable,
      content: layer.content
    })),
    [
      {
        id: "skill:compatibility_first",
        source: "skill",
        priority: 30,
        enabled: true,
        editable: false,
        content: "Prefer compatibility before platform-specific enhancements."
      }
    ]
  )
  assert.deepEqual(promptContext.commandDefinitions, [])

  const bundle = new PromptAssembler({ requestIdFactory: () => "req_skill_1" }).assemble({
    model: "local-test",
    modelRole: "chat",
    layers: [
      {
        id: "runtime_contract",
        source: "builtin",
        priority: 10,
        enabled: true,
        editable: false,
        version: "1",
        content: "Use controlled tools."
      },
      ...promptContext.layers
    ],
    enabledSkillIds: promptContext.enabledSkillIds
  })

  assert.deepEqual(bundle.enabledSkillIds, ["compatibility_first"])
  assert.deepEqual(
    bundle.layers.map((layer) => layer.id),
    ["runtime_contract", "skill:compatibility_first"]
  )
})

test("SkillManager keeps the highest-priority skill when enabled skills conflict", () => {
  const manager = new SkillManager()
  manager.loadSkill({
    id: "strict_review",
    name: "Strict Review",
    version: "1",
    source: "project",
    priority: 20,
    defaultEnabled: true,
    editable: true,
    content: "Review with strict engineering criteria.",
    conflictsWith: ["fast_review"]
  })
  manager.loadSkill({
    id: "fast_review",
    name: "Fast Review",
    version: "1",
    source: "project",
    priority: 50,
    defaultEnabled: true,
    editable: true,
    content: "Prefer a fast lightweight review.",
    conflictsWith: ["strict_review"]
  })

  const promptContext = manager.resolvePromptContext({
    sessionId: "session_2",
    projectId: "myhanako",
    mode: "review"
  })

  assert.deepEqual(promptContext.enabledSkillIds, ["strict_review"])
  assert.deepEqual(promptContext.conflictSkillIds, ["fast_review"])
  assert.deepEqual(
    promptContext.warnings,
    ["Skill fast_review disabled for this prompt because it conflicts with strict_review."]
  )
  assert.deepEqual(
    promptContext.layers.map((layer) => layer.id),
    ["skill:strict_review"]
  )
})

test("SkillManager exposes file-backed enabled skills for runtime resource loading", () => {
  const manager = new SkillManager()
  manager.loadSkill({
    id: "workspace_skill",
    name: "Workspace Skill",
    version: "1",
    source: "project",
    priority: 20,
    defaultEnabled: true,
    editable: false,
    content: "Use the workspace skill file.",
    description: "Workspace guidance.",
    filePath: "F:\\workspace\\.agents\\skills\\workspace\\SKILL.md",
    baseDir: "F:\\workspace\\.agents\\skills\\workspace",
    disableModelInvocation: true
  })
  manager.loadSkill({
    id: "prompt_only",
    name: "Prompt Only",
    version: "1",
    source: "user",
    priority: 30,
    defaultEnabled: true,
    editable: true,
    content: "This skill only exists as a prompt layer."
  })

  const result = manager.getSkillsForAgent({
    projectId: "myhanako"
  })

  assert.deepEqual(result.skills, [
    {
      name: "Workspace Skill",
      description: "Workspace guidance.",
      filePath: "F:\\workspace\\.agents\\skills\\workspace\\SKILL.md",
      baseDir: "F:\\workspace\\.agents\\skills\\workspace",
      sourceInfo: {
        id: "workspace_skill",
        source: "project",
        version: "1"
      },
      disableModelInvocation: true
    }
  ])
  assert.deepEqual(result.diagnostics, [
    {
      type: "skill_resource_unavailable",
      skillId: "prompt_only",
      message: "Skill prompt_only is prompt-only; filePath and baseDir are required for Pi resource sync."
    }
  ])
})
