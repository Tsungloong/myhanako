import assert from "node:assert/strict"
import test from "node:test"
import { DiffService } from "../src/diff-service.ts"
import type { PatchModel } from "../src/workspace-service.ts"

test("DiffService renders replacement patches as display hunks with line numbers", () => {
  const patch = createPatch({
    path: "docs/note.md",
    oldContent: "# Title\nold line\ntail\n",
    newContent: "# Title\nnew line\nanother line\ntail\n",
    summary: "Update note copy."
  })

  const diff = new DiffService().renderDiffModel(patch)

  assert.deepEqual(diff, {
    patchId: "patch_1",
    snapshotId: "snapshot_1",
    path: "docs/note.md",
    language: "markdown",
    oldChecksum: "sha256:old",
    newChecksum: "sha256:new",
    summary: "Update note copy.",
    hunks: [
      {
        oldStart: 1,
        oldLineCount: 3,
        newStart: 1,
        newLineCount: 4,
        lines: [
          {
            type: "context",
            oldLineNumber: 1,
            newLineNumber: 1,
            content: "# Title"
          },
          {
            type: "delete",
            oldLineNumber: 2,
            content: "old line"
          },
          {
            type: "insert",
            newLineNumber: 2,
            content: "new line"
          },
          {
            type: "insert",
            newLineNumber: 3,
            content: "another line"
          },
          {
            type: "context",
            oldLineNumber: 3,
            newLineNumber: 4,
            content: "tail"
          }
        ]
      }
    ]
  })
})

test("DiffService renders unchanged patches without hunks", () => {
  const patch = createPatch({
    path: "src/app.ts",
    oldContent: "const value = 1\n",
    newContent: "const value = 1\n"
  })

  const diff = new DiffService().renderDiffModel(patch)

  assert.equal(diff.language, "typescript")
  assert.deepEqual(diff.hunks, [])
})

function createPatch(input: {
  readonly path: string
  readonly oldContent: string
  readonly newContent: string
  readonly summary?: string
}): PatchModel {
  return {
    patchId: "patch_1",
    snapshotId: "snapshot_1",
    path: input.path,
    oldChecksum: "sha256:old",
    newChecksum: "sha256:new",
    oldContent: input.oldContent,
    newContent: input.newContent,
    ...(input.summary ? { summary: input.summary } : {})
  }
}
