export type ModelRef = {
  readonly id: string
  readonly provider?: string
}

export type StrictModelRef = {
  readonly id: string
  readonly provider: string
}

export function parseModelRef(ref: unknown): StrictModelRef | ModelRef | null {
  if (!ref) {
    return null
  }

  if (typeof ref === "object") {
    const candidate = ref as { readonly id?: unknown; readonly provider?: unknown }
    if (typeof candidate.id !== "string" || candidate.id.length === 0) {
      return null
    }
    return {
      id: candidate.id,
      provider: typeof candidate.provider === "string" ? candidate.provider : ""
    }
  }

  if (typeof ref !== "string") {
    return null
  }

  const trimmed = ref.trim()
  if (trimmed.length === 0) {
    return null
  }

  const slashIndex = trimmed.indexOf("/")
  if (slashIndex > 0 && slashIndex < trimmed.length - 1) {
    return {
      provider: trimmed.slice(0, slashIndex),
      id: trimmed.slice(slashIndex + 1)
    }
  }

  return {
    id: trimmed,
    provider: ""
  }
}

export function requireModelRef(ref: unknown): StrictModelRef {
  const parsed = parseModelRef(ref)
  if (!parsed?.id || !parsed.provider) {
    throw new Error(`requireModelRef: missing id or provider (got ${JSON.stringify(ref)})`)
  }

  return {
    id: parsed.id,
    provider: parsed.provider
  }
}

export function findModel<TModel extends StrictModelRef>(
  availableModels: readonly TModel[],
  idOrRef: string | StrictModelRef,
  provider?: string
): TModel | null {
  const ref = typeof idOrRef === "object" ? idOrRef : { id: idOrRef, provider }
  if (!ref.id || !ref.provider) {
    throw new Error(
      `findModel: id and provider both required (got id=${ref.id}, provider=${ref.provider})`
    )
  }

  return availableModels.find((model) => model.id === ref.id && model.provider === ref.provider) ?? null
}

export function modelRefEquals(left: ModelRef | null | undefined, right: ModelRef | null | undefined): boolean {
  if (!left?.id || !right?.id || !left.provider || !right.provider) {
    return false
  }

  return left.id === right.id && left.provider === right.provider
}

export function modelRefKey(ref: ModelRef): string {
  if (!ref.id || !ref.provider) {
    throw new Error(`modelRefKey: missing id or provider (got ${JSON.stringify(ref)})`)
  }

  return `${ref.provider}/${ref.id}`
}
