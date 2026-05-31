export type RuntimeResourceSkill = {
  readonly name: string
  readonly description: string
  readonly filePath: string
  readonly baseDir: string
  readonly sourceInfo: unknown
  readonly disableModelInvocation: boolean
}

export type RuntimeResourceDiagnostic = {
  readonly [key: string]: unknown
}

export type RuntimeResourceSkillResult = {
  readonly skills: readonly RuntimeResourceSkill[]
  readonly diagnostics: readonly RuntimeResourceDiagnostic[]
}

export type RuntimeResourceLoaderLike = {
  readonly reload: () => void | Promise<void>
  readonly getSkills?: () => RuntimeResourceSkillResult
}

export type RuntimeResourceLoaderFactoryOptions = {
  readonly cwd: string
  readonly agentDir: string
  readonly settingsManager?: unknown
  readonly eventBus?: unknown
  readonly additionalExtensionPaths: readonly string[]
  readonly additionalSkillPaths: readonly string[]
  readonly extensionFactories: readonly unknown[]
  readonly skillsOverride?: (base: RuntimeResourceSkillResult) => RuntimeResourceSkillResult
}

export type CreateDefaultResourceLoader = (
  options: RuntimeResourceLoaderFactoryOptions
) => RuntimeResourceLoaderLike | Promise<RuntimeResourceLoaderLike>

export type RuntimeResourceContributions = {
  readonly tools?: readonly string[]
  readonly customTools?: readonly unknown[]
  readonly skills?: readonly RuntimeResourceSkill[]
  readonly diagnostics?: readonly RuntimeResourceDiagnostic[]
  readonly skillPaths?: readonly string[]
  readonly extensionPaths?: readonly string[]
  readonly extensionFactories?: readonly unknown[]
  readonly toolDefinitions?: readonly unknown[]
  readonly commandDefinitions?: readonly unknown[]
  readonly pluginSnapshots?: readonly unknown[]
}

export type RuntimeResourceLoaderOptions = {
  readonly cwd: string
  readonly agentDir: string
  readonly settingsManager?: unknown
  readonly eventBus?: unknown
  readonly createDefaultResourceLoader?: CreateDefaultResourceLoader
  readonly contributions?: RuntimeResourceContributions
}

export type RuntimeResourceState = {
  readonly resourceLoader: RuntimeResourceLoaderLike
  readonly tools: readonly unknown[]
  readonly customTools: readonly unknown[]
  readonly skills: readonly RuntimeResourceSkill[]
  readonly diagnostics: readonly RuntimeResourceDiagnostic[]
  readonly skillPaths: readonly string[]
  readonly extensionPaths: readonly string[]
  readonly extensionFactories: readonly unknown[]
  readonly toolDefinitions: readonly unknown[]
  readonly commandDefinitions: readonly unknown[]
  readonly pluginSnapshots: readonly unknown[]
}

export type SessionRuntimeResources = {
  readonly resourceLoader: RuntimeResourceLoaderLike
  readonly tools: readonly unknown[]
  readonly customTools: readonly unknown[]
}

export type RuntimeResourceTransparencySnapshot = {
  readonly tools: readonly unknown[]
  readonly skills: readonly RuntimeResourceSkill[]
  readonly diagnostics: readonly RuntimeResourceDiagnostic[]
  readonly skillPaths: readonly string[]
  readonly extensionPaths: readonly string[]
  readonly extensionFactories: readonly unknown[]
  readonly toolDefinitions: readonly unknown[]
  readonly commandDefinitions: readonly unknown[]
  readonly pluginSnapshots: readonly unknown[]
}

export class RuntimeResourceLoader {
  readonly #options: RuntimeResourceLoaderOptions
  #state?: RuntimeResourceState

  constructor(options: RuntimeResourceLoaderOptions) {
    this.#options = options
  }

  get state(): RuntimeResourceState | undefined {
    return this.#state
  }

  async reload(contributions: RuntimeResourceContributions = {}): Promise<RuntimeResourceState> {
    const mergedContributions = mergeContributions(
      this.#options.contributions,
      contributions
    )
    const resourceLoader = await this.#createResourceLoader(mergedContributions)

    await resourceLoader.reload()
    const skillResult = resourceLoader.getSkills?.() ?? {
      skills: [],
      diagnostics: []
    }
    const state: RuntimeResourceState = {
      resourceLoader,
      tools: [...mergedContributions.tools],
      customTools: [...mergedContributions.customTools],
      skills: [...skillResult.skills],
      diagnostics: [...skillResult.diagnostics],
      skillPaths: [...mergedContributions.skillPaths],
      extensionPaths: [...mergedContributions.extensionPaths],
      extensionFactories: [...mergedContributions.extensionFactories],
      toolDefinitions: [...mergedContributions.toolDefinitions],
      commandDefinitions: [...mergedContributions.commandDefinitions],
      pluginSnapshots: [...mergedContributions.pluginSnapshots]
    }
    this.#state = state
    return state
  }

  toSessionRuntime(): SessionRuntimeResources {
    const state = this.#state
    if (!state) {
      throw new Error("RuntimeResourceLoader.reload() must complete before session runtime resources are read")
    }

    return {
      resourceLoader: state.resourceLoader,
      tools: [...state.tools],
      customTools: [...state.customTools]
    }
  }

  toTransparencySnapshot(): RuntimeResourceTransparencySnapshot {
    const state = this.#state
    if (!state) {
      throw new Error("RuntimeResourceLoader.reload() must complete before transparency snapshot is read")
    }

    return {
      tools: [...state.tools],
      skills: [...state.skills],
      diagnostics: [...state.diagnostics],
      skillPaths: [...state.skillPaths],
      extensionPaths: [...state.extensionPaths],
      extensionFactories: [...state.extensionFactories],
      toolDefinitions: [...state.toolDefinitions],
      commandDefinitions: [...state.commandDefinitions],
      pluginSnapshots: [...state.pluginSnapshots]
    }
  }

  async #createResourceLoader(
    contributions: RequiredRuntimeResourceContributions
  ): Promise<RuntimeResourceLoaderLike> {
    const createDefaultResourceLoader = this.#options.createDefaultResourceLoader ?? defaultCreateDefaultResourceLoader
    return createDefaultResourceLoader({
      cwd: this.#options.cwd,
      agentDir: this.#options.agentDir,
      settingsManager: this.#options.settingsManager,
      eventBus: this.#options.eventBus,
      additionalExtensionPaths: [...contributions.extensionPaths],
      additionalSkillPaths: [...contributions.skillPaths],
      extensionFactories: [...contributions.extensionFactories],
      skillsOverride: createSkillsOverride(contributions.skills, contributions.diagnostics)
    })
  }
}

type RequiredRuntimeResourceContributions = {
  readonly tools: readonly string[]
  readonly customTools: readonly unknown[]
  readonly skills: readonly RuntimeResourceSkill[]
  readonly diagnostics: readonly RuntimeResourceDiagnostic[]
  readonly skillPaths: readonly string[]
  readonly extensionPaths: readonly string[]
  readonly extensionFactories: readonly unknown[]
  readonly toolDefinitions: readonly unknown[]
  readonly commandDefinitions: readonly unknown[]
  readonly pluginSnapshots: readonly unknown[]
}

async function defaultCreateDefaultResourceLoader(
  options: RuntimeResourceLoaderFactoryOptions
): Promise<RuntimeResourceLoaderLike> {
  const piSdk = await import("../../lib/pi-sdk/index.ts")
  return new piSdk.DefaultResourceLoader(options as never) as RuntimeResourceLoaderLike
}

function createSkillsOverride(
  skills: readonly RuntimeResourceSkill[],
  diagnostics: readonly RuntimeResourceDiagnostic[]
): (base: RuntimeResourceSkillResult) => RuntimeResourceSkillResult {
  return (base) => ({
    skills: [...base.skills, ...skills],
    diagnostics: [...base.diagnostics, ...diagnostics]
  })
}

function mergeContributions(
  base: RuntimeResourceContributions | undefined,
  override: RuntimeResourceContributions
): RequiredRuntimeResourceContributions {
  return {
    tools: [...(base?.tools ?? []), ...(override.tools ?? [])],
    customTools: [...(base?.customTools ?? []), ...(override.customTools ?? [])],
    skills: [...(base?.skills ?? []), ...(override.skills ?? [])],
    diagnostics: [...(base?.diagnostics ?? []), ...(override.diagnostics ?? [])],
    skillPaths: [...(base?.skillPaths ?? []), ...(override.skillPaths ?? [])],
    extensionPaths: [
      ...(base?.extensionPaths ?? []),
      ...(override.extensionPaths ?? [])
    ],
    extensionFactories: [
      ...(base?.extensionFactories ?? []),
      ...(override.extensionFactories ?? [])
    ],
    toolDefinitions: [
      ...(base?.toolDefinitions ?? []),
      ...(override.toolDefinitions ?? [])
    ],
    commandDefinitions: [
      ...(base?.commandDefinitions ?? []),
      ...(override.commandDefinitions ?? [])
    ],
    pluginSnapshots: [
      ...(base?.pluginSnapshots ?? []),
      ...(override.pluginSnapshots ?? [])
    ]
  }
}
