import { createHash } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, isAbsolute, relative, resolve, sep } from "node:path"
import type { SessionEventLog } from "./session-event-log.ts"

export type FileAuditContext = {
  readonly sessionId: string
  readonly eventLog: SessionEventLog
  readonly correlationId?: string
  readonly parentEventId?: string
}

export type WorkspaceSnapshot = {
  readonly snapshotId: string
  readonly path: string
  readonly checksum: string
  readonly content: string
}

export type PatchModel = {
  readonly patchId: string
  readonly snapshotId: string
  readonly path: string
  readonly oldChecksum: string
  readonly newChecksum: string
  readonly oldContent: string
  readonly newContent: string
  readonly summary?: string
}

export type FileWriteCommit = {
  readonly patchId: string
  readonly path: string
  readonly checksum: string
}

export type PatchStore = {
  get(id: string): Promise<PatchModel | null>
  put(patch: PatchModel): Promise<void>
  delete(id: string): Promise<boolean>
}

export type WorkspaceServiceOptions = {
  readonly rootDir: string
  readonly patchStore?: PatchStore
  readonly snapshotIdFactory?: () => string
}

export type ProposeReplacementInput = {
  readonly snapshot: WorkspaceSnapshot
  readonly newContent: string
  readonly summary?: string
}

export type PatchServiceOptions = {
  readonly patchStore: PatchStore
  readonly patchIdFactory?: () => string
}

export class InMemoryPatchStore implements PatchStore {
  readonly #patches = new Map<string, PatchModel>()

  async get(id: string): Promise<PatchModel | null> {
    const patch = this.#patches.get(id)
    return patch ? clonePatchModel(patch) : null
  }

  async put(patch: PatchModel): Promise<void> {
    this.#patches.set(patch.patchId, clonePatchModel(patch))
  }

  async delete(id: string): Promise<boolean> {
    return this.#patches.delete(id)
  }
}

export class WorkspaceService {
  readonly #rootDir: string
  readonly #patchStore: PatchStore
  readonly #snapshotIdFactory: () => string

  constructor(options: WorkspaceServiceOptions) {
    this.#rootDir = resolve(options.rootDir)
    this.#patchStore = options.patchStore ?? new InMemoryPatchStore()
    this.#snapshotIdFactory = options.snapshotIdFactory ?? (() => `snapshot_${Date.now()}`)
  }

  async readSnapshot(path: string, audit?: FileAuditContext): Promise<WorkspaceSnapshot> {
    const resolved = this.#resolvePath(path)
    const content = await readFile(resolved.absolutePath, "utf8")
    const snapshot = {
      snapshotId: this.#snapshotIdFactory(),
      path: resolved.workspacePath,
      checksum: checksum(content),
      content
    } satisfies WorkspaceSnapshot

    if (audit) {
      await audit.eventLog.append({
        sessionId: audit.sessionId,
        type: "file_snapshot_read",
        actor: "system",
        correlationId: audit.correlationId,
        parentEventId: audit.parentEventId,
        payload: {
          snapshotId: snapshot.snapshotId,
          path: snapshot.path,
          checksum: snapshot.checksum
        }
      })
    }

    return cloneWorkspaceSnapshot(snapshot)
  }

  async commitPatch(patchId: string, audit?: FileAuditContext): Promise<FileWriteCommit> {
    const patch = await this.#patchStore.get(patchId)
    if (!patch) {
      throw new Error(`Patch not found: ${patchId}`)
    }

    const resolved = this.#resolvePath(patch.path)
    const currentContent = await readFile(resolved.absolutePath, "utf8")
    if (checksum(currentContent) !== patch.oldChecksum) {
      throw new Error(`Patch base checksum mismatch: ${patch.path}`)
    }

    await mkdir(dirname(resolved.absolutePath), { recursive: true })
    await writeFile(resolved.absolutePath, patch.newContent, "utf8")
    await this.#patchStore.delete(patch.patchId)

    const commit = {
      patchId: patch.patchId,
      path: patch.path,
      checksum: patch.newChecksum
    } satisfies FileWriteCommit

    if (audit) {
      await audit.eventLog.append({
        sessionId: audit.sessionId,
        type: "file_write_committed",
        actor: "system",
        correlationId: audit.correlationId,
        parentEventId: audit.parentEventId,
        payload: commit
      })
    }

    return commit
  }

  #resolvePath(inputPath: string): ResolvedWorkspacePath {
    return resolveWorkspacePath(this.#rootDir, inputPath)
  }
}

export class PatchService {
  readonly #patchStore: PatchStore
  readonly #patchIdFactory: () => string

  constructor(options: PatchServiceOptions) {
    this.#patchStore = options.patchStore
    this.#patchIdFactory = options.patchIdFactory ?? (() => `patch_${Date.now()}`)
  }

  async proposeReplacement(
    input: ProposeReplacementInput,
    audit?: FileAuditContext
  ): Promise<PatchModel> {
    const patch = {
      patchId: this.#patchIdFactory(),
      snapshotId: input.snapshot.snapshotId,
      path: input.snapshot.path,
      oldChecksum: input.snapshot.checksum,
      newChecksum: checksum(input.newContent),
      oldContent: input.snapshot.content,
      newContent: input.newContent,
      ...(input.summary ? { summary: input.summary } : {})
    } satisfies PatchModel

    await this.#patchStore.put(patch)
    if (audit) {
      await audit.eventLog.append({
        sessionId: audit.sessionId,
        type: "file_patch_proposed",
        actor: "system",
        correlationId: audit.correlationId,
        parentEventId: audit.parentEventId,
        payload: {
          patchId: patch.patchId,
          snapshotId: patch.snapshotId,
          path: patch.path,
          oldChecksum: patch.oldChecksum,
          newChecksum: patch.newChecksum,
          ...(patch.summary ? { summary: patch.summary } : {})
        }
      })
    }

    return clonePatchModel(patch)
  }
}

type ResolvedWorkspacePath = {
  readonly absolutePath: string
  readonly workspacePath: string
}

function resolveWorkspacePath(rootDir: string, inputPath: string): ResolvedWorkspacePath {
  const absoluteRoot = resolve(rootDir)
  const absolutePath = isAbsolute(inputPath)
    ? resolve(inputPath)
    : resolve(absoluteRoot, inputPath)
  const relativePath = relative(absoluteRoot, absolutePath)
  if (
    relativePath.length === 0 ||
    relativePath.startsWith(`..${sep}`) ||
    relativePath === ".." ||
    isAbsolute(relativePath)
  ) {
    throw new Error(`Path escapes workspace root: ${normalizeInputPath(inputPath)}`)
  }

  return {
    absolutePath,
    workspacePath: relativePath.split(sep).join("/")
  }
}

function checksum(content: string): string {
  return `sha256:${createHash("sha256").update(content, "utf8").digest("hex")}`
}

function cloneWorkspaceSnapshot(snapshot: WorkspaceSnapshot): WorkspaceSnapshot {
  return { ...snapshot }
}

function clonePatchModel(patch: PatchModel): PatchModel {
  return { ...patch }
}

function normalizeInputPath(path: string): string {
  return path.replace(/\\/g, "/")
}