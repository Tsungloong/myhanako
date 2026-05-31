import {
  createAgentSession as rawCreateAgentSession,
  AuthStorage,
  DefaultResourceLoader,
  ModelRegistry,
  SessionManager,
  SettingsManager
} from "@mariozechner/pi-coding-agent"
import {
  normalizeCreateAgentSessionOptions,
  PI_BUILTIN_TOOL_NAMES
} from "./session-options.ts"
import { installAssistantStreamGuard } from "./stream-guard.ts"

export {
  AuthStorage,
  DefaultResourceLoader,
  ModelRegistry,
  PI_BUILTIN_TOOL_NAMES,
  SessionManager,
  SettingsManager,
  installAssistantStreamGuard,
  normalizeCreateAgentSessionOptions
}

export async function createAgentSession(options: Record<string, unknown>) {
  const resourceLoaderAgentDir = getResourceLoaderAgentDir(options)
  const sessionOptions = !options.agentDir && resourceLoaderAgentDir
    ? { ...options, agentDir: resourceLoaderAgentDir }
    : options
  const result = await rawCreateAgentSession(normalizeCreateAgentSessionOptions(sessionOptions))
  installAssistantStreamGuard((result as { session?: unknown })?.session)
  return result
}

export function createModelRegistry(authStorage: unknown, modelsJsonPath?: string) {
  return ModelRegistry.create(authStorage, modelsJsonPath)
}

function getResourceLoaderAgentDir(options: Record<string, unknown>): string | null {
  const resourceLoader = options.resourceLoader as { readonly agentDir?: unknown } | undefined
  return typeof resourceLoader?.agentDir === "string" && resourceLoader.agentDir
    ? resourceLoader.agentDir
    : null
}
