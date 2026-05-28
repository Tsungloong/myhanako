import type { PromptLayerInput } from "./prompt-assembler.ts"

export type SkillSource = "builtin" | "project" | "user" | "plugin"
export type SkillStatus = "enabled" | "disabled"
export type SkillBindingScope = "global" | "project" | "session" | "mode"

export type SkillManifest = {
  readonly id: string
  readonly name: string
  readonly version: string
  readonly source: SkillSource
  readonly priority: number
  readonly content: string
  readonly defaultEnabled?: boolean
  readonly editable?: boolean
  readonly tokenBudget?: number
  readonly conflictsWith?: readonly string[]
}

export type SkillSnapshot = {
  readonly id: string
  readonly name: string
  readonly version: string
  readonly source: SkillSource
  readonly priority: number
  readonly status: SkillStatus
  readonly defaultEnabled: boolean
  readonly editable: boolean
  readonly tokenBudget?: number
  readonly conflictsWith: readonly string[]
}

export type SkillBinding = {
  readonly skillId: string
  readonly scope: SkillBindingScope
  readonly scopeId?: string
  readonly enabled: boolean
}

export type SkillPromptContextInput = {
  readonly sessionId?: string
  readonly projectId?: string
  readonly mode?: string
}

export type SkillPromptContext = {
  readonly enabledSkillIds: readonly string[]
  readonly conflictSkillIds: readonly string[]
  readonly layers: readonly PromptLayerInput[]
  readonly warnings: readonly string[]
  readonly commandDefinitions: readonly never[]
}

type LoadedSkill = {
  readonly manifest: SkillManifest
  status: SkillStatus
}

export class SkillManager {
  readonly #skills = new Map<string, LoadedSkill>()
  readonly #bindings = new Map<string, SkillBinding>()

  loadSkill(manifest: SkillManifest): SkillSnapshot {
    validateSkillManifest(manifest)
    if (this.#skills.has(manifest.id)) {
      throw new Error(`Skill already loaded: ${manifest.id}`)
    }

    const loaded: LoadedSkill = {
      manifest,
      status: "enabled"
    }
    this.#skills.set(manifest.id, loaded)
    return toSkillSnapshot(loaded)
  }

  listSkills(): readonly SkillSnapshot[] {
    return Array.from(this.#skills.values())
      .map(toSkillSnapshot)
      .sort(compareSkillSnapshots)
  }

  setSkillEnabled(skillId: string, enabled: boolean): boolean {
    const skill = this.#skills.get(skillId)
    if (!skill) {
      return false
    }

    skill.status = enabled ? "enabled" : "disabled"
    return true
  }

  bindSkill(binding: SkillBinding): void {
    if (!this.#skills.has(binding.skillId)) {
      throw new Error(`Skill not loaded: ${binding.skillId}`)
    }
    if (binding.scope !== "global" && !binding.scopeId?.trim()) {
      throw new Error(`Skill binding scopeId required: ${binding.skillId}`)
    }

    this.#bindings.set(toBindingKey(binding), {
      ...binding
    })
  }

  resolvePromptContext(input: SkillPromptContextInput = {}): SkillPromptContext {
    const candidates = Array.from(this.#skills.values())
      .filter((skill) => skill.status === "enabled")
      .filter((skill) => isSkillActive(skill.manifest, input, this.#bindings))
      .sort(compareLoadedSkills)

    const accepted: LoadedSkill[] = []
    const conflictSkillIds: string[] = []
    const warnings: string[] = []

    for (const candidate of candidates) {
      const conflictingSkill = accepted.find((skill) =>
        skillsConflict(candidate.manifest, skill.manifest)
      )
      if (conflictingSkill) {
        conflictSkillIds.push(candidate.manifest.id)
        warnings.push(
          `Skill ${candidate.manifest.id} disabled for this prompt because it conflicts with ${conflictingSkill.manifest.id}.`
        )
        continue
      }
      accepted.push(candidate)
    }

    return {
      enabledSkillIds: accepted.map((skill) => skill.manifest.id),
      conflictSkillIds,
      layers: accepted.map((skill) => toPromptLayer(skill.manifest)),
      warnings,
      commandDefinitions: []
    }
  }
}

function validateSkillManifest(manifest: SkillManifest): void {
  if (!manifest.id.trim()) {
    throw new Error("Skill id required")
  }
  if (!manifest.name.trim()) {
    throw new Error(`Skill name required: ${manifest.id}`)
  }
  if (!manifest.version.trim()) {
    throw new Error(`Skill version required: ${manifest.id}`)
  }
  if (!Number.isFinite(manifest.priority)) {
    throw new Error(`Skill priority required: ${manifest.id}`)
  }
  if (!manifest.content.trim()) {
    throw new Error(`Skill content required: ${manifest.id}`)
  }
}

function isSkillActive(
  manifest: SkillManifest,
  input: SkillPromptContextInput,
  bindings: ReadonlyMap<string, SkillBinding>
): boolean {
  const sessionBinding = findBinding(bindings, manifest.id, "session", input.sessionId)
  if (sessionBinding) {
    return sessionBinding.enabled
  }

  const projectBinding = findBinding(bindings, manifest.id, "project", input.projectId)
  if (projectBinding) {
    return projectBinding.enabled
  }

  const modeBinding = findBinding(bindings, manifest.id, "mode", input.mode)
  if (modeBinding) {
    return modeBinding.enabled
  }

  const globalBinding = findBinding(bindings, manifest.id, "global")
  if (globalBinding) {
    return globalBinding.enabled
  }

  return manifest.defaultEnabled ?? false
}

function findBinding(
  bindings: ReadonlyMap<string, SkillBinding>,
  skillId: string,
  scope: SkillBindingScope,
  scopeId?: string
): SkillBinding | undefined {
  return bindings.get(toBindingKey({ skillId, scope, scopeId, enabled: true }))
}

function skillsConflict(left: SkillManifest, right: SkillManifest): boolean {
  return (
    (left.conflictsWith ?? []).includes(right.id) ||
    (right.conflictsWith ?? []).includes(left.id)
  )
}

function toPromptLayer(manifest: SkillManifest): PromptLayerInput {
  return {
    id: `skill:${manifest.id}`,
    source: "skill",
    priority: manifest.priority,
    enabled: true,
    editable: manifest.editable ?? true,
    tokenBudget: manifest.tokenBudget,
    version: manifest.version,
    content: manifest.content
  }
}

function toSkillSnapshot(skill: LoadedSkill): SkillSnapshot {
  const snapshot: SkillSnapshot = {
    id: skill.manifest.id,
    name: skill.manifest.name,
    version: skill.manifest.version,
    source: skill.manifest.source,
    priority: skill.manifest.priority,
    status: skill.status,
    defaultEnabled: skill.manifest.defaultEnabled ?? false,
    editable: skill.manifest.editable ?? true,
    tokenBudget: skill.manifest.tokenBudget,
    conflictsWith: [...(skill.manifest.conflictsWith ?? [])]
  }

  return withoutUndefinedTokenBudget(snapshot)
}

function withoutUndefinedTokenBudget(snapshot: SkillSnapshot): SkillSnapshot {
  if (snapshot.tokenBudget !== undefined) {
    return snapshot
  }

  const { tokenBudget: _tokenBudget, ...rest } = snapshot
  return rest
}

function compareLoadedSkills(left: LoadedSkill, right: LoadedSkill): number {
  if (left.manifest.priority !== right.manifest.priority) {
    return left.manifest.priority - right.manifest.priority
  }

  return left.manifest.id.localeCompare(right.manifest.id)
}

function compareSkillSnapshots(left: SkillSnapshot, right: SkillSnapshot): number {
  if (left.priority !== right.priority) {
    return left.priority - right.priority
  }

  return left.id.localeCompare(right.id)
}

function toBindingKey(binding: Pick<SkillBinding, "skillId" | "scope" | "scopeId">): string {
  return `${binding.skillId}:${binding.scope}:${binding.scopeId ?? ""}`
}
