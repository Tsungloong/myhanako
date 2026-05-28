import { extname } from "node:path"
import type { PatchModel } from "./workspace-service.ts"

export type DiffLineType = "context" | "delete" | "insert"

export type DiffLine = {
  readonly type: DiffLineType
  readonly content: string
  readonly oldLineNumber?: number
  readonly newLineNumber?: number
}

export type DiffHunk = {
  readonly oldStart: number
  readonly oldLineCount: number
  readonly newStart: number
  readonly newLineCount: number
  readonly lines: readonly DiffLine[]
}

export type DiffModel = {
  readonly patchId: string
  readonly snapshotId: string
  readonly path: string
  readonly language: string
  readonly oldChecksum: string
  readonly newChecksum: string
  readonly summary?: string
  readonly hunks: readonly DiffHunk[]
}

export class DiffService {
  renderDiffModel(patch: PatchModel): DiffModel {
    return {
      patchId: patch.patchId,
      snapshotId: patch.snapshotId,
      path: patch.path,
      language: inferLanguage(patch.path),
      oldChecksum: patch.oldChecksum,
      newChecksum: patch.newChecksum,
      ...(patch.summary ? { summary: patch.summary } : {}),
      hunks: renderReplacementHunks(
        patch.oldContent,
        patch.newContent,
        defaultContextLineCount
      )
    }
  }
}

function renderReplacementHunks(
  oldContent: string,
  newContent: string,
  contextLineCount: number
): readonly DiffHunk[] {
  const oldLines = splitDisplayLines(oldContent)
  const newLines = splitDisplayLines(newContent)
  let commonPrefix = 0
  while (
    commonPrefix < oldLines.length &&
    commonPrefix < newLines.length &&
    oldLines[commonPrefix] === newLines[commonPrefix]
  ) {
    commonPrefix++
  }

  let commonSuffix = 0
  while (
    commonSuffix < oldLines.length - commonPrefix &&
    commonSuffix < newLines.length - commonPrefix &&
    oldLines[oldLines.length - commonSuffix - 1] ===
      newLines[newLines.length - commonSuffix - 1]
  ) {
    commonSuffix++
  }

  if (commonPrefix === oldLines.length && commonPrefix === newLines.length) {
    return []
  }

  const oldChangeStart = commonPrefix
  const newChangeStart = commonPrefix
  const oldChangeEnd = oldLines.length - commonSuffix
  const newChangeEnd = newLines.length - commonSuffix
  const contextBefore = Math.min(contextLineCount, commonPrefix)
  const contextAfter = Math.min(contextLineCount, commonSuffix)
  const hunkOldStartIndex = oldChangeStart - contextBefore
  const hunkNewStartIndex = newChangeStart - contextBefore
  const oldLineCount = contextBefore + oldChangeEnd - oldChangeStart + contextAfter
  const newLineCount = contextBefore + newChangeEnd - newChangeStart + contextAfter
  const lines: DiffLine[] = []

  for (let index = 0; index < contextBefore; index++) {
    const oldIndex = hunkOldStartIndex + index
    const newIndex = hunkNewStartIndex + index
    lines.push({
      type: "context",
      oldLineNumber: oldIndex + 1,
      newLineNumber: newIndex + 1,
      content: oldLines[oldIndex]
    })
  }

  for (let oldIndex = oldChangeStart; oldIndex < oldChangeEnd; oldIndex++) {
    lines.push({
      type: "delete",
      oldLineNumber: oldIndex + 1,
      content: oldLines[oldIndex]
    })
  }

  for (let newIndex = newChangeStart; newIndex < newChangeEnd; newIndex++) {
    lines.push({
      type: "insert",
      newLineNumber: newIndex + 1,
      content: newLines[newIndex]
    })
  }

  for (let index = 0; index < contextAfter; index++) {
    const oldIndex = oldChangeEnd + index
    const newIndex = newChangeEnd + index
    lines.push({
      type: "context",
      oldLineNumber: oldIndex + 1,
      newLineNumber: newIndex + 1,
      content: oldLines[oldIndex]
    })
  }

  return [
    {
      oldStart: Math.max(1, hunkOldStartIndex + 1),
      oldLineCount,
      newStart: Math.max(1, hunkNewStartIndex + 1),
      newLineCount,
      lines
    }
  ]
}

function splitDisplayLines(content: string): readonly string[] {
  if (content.length === 0) {
    return []
  }

  const lines = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n")
  if (lines.at(-1) === "") {
    return lines.slice(0, -1)
  }

  return lines
}

function inferLanguage(path: string): string {
  return languageByExtension.get(extname(path).toLowerCase()) ?? "text"
}

const defaultContextLineCount = 3

const languageByExtension = new Map<string, string>([
  [".cjs", "javascript"],
  [".css", "css"],
  [".cts", "typescript"],
  [".html", "html"],
  [".js", "javascript"],
  [".json", "json"],
  [".jsx", "javascript"],
  [".md", "markdown"],
  [".mdx", "markdown"],
  [".mjs", "javascript"],
  [".mts", "typescript"],
  [".py", "python"],
  [".ts", "typescript"],
  [".tsx", "typescript"],
  [".txt", "text"],
  [".yml", "yaml"],
  [".yaml", "yaml"]
])
