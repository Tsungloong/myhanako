const STREAM_GUARD_FLAG = Symbol.for("myhanako.piSdk.streamGuardInstalled")

export function installAssistantStreamGuard(session: unknown): void {
  const candidate = session as {
    readonly agent?: {
      streamFn?: unknown
      [STREAM_GUARD_FLAG]?: boolean
    }
  } | null
  const agent = candidate?.agent
  if (!agent || typeof agent.streamFn !== "function" || agent[STREAM_GUARD_FLAG]) {
    return
  }

  agent[STREAM_GUARD_FLAG] = true
}
