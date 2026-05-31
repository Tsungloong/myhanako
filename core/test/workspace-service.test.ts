import assert from "node:assert/strict"
import { mkdtemp, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"
import {
  InMemorySessionEventStore,
  SessionEventLog
} from "../src/session-event-log.ts"
import {
  InMemoryPatchStore,
  PatchService,
  WorkspaceService
} from "../src/workspace-service.ts"

test("WorkspaceService reads snapshots and records file_snapshot_read events", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "myhanako-workspace-"))
  await writeFile(join(rootDir, "src-app.txt"), "old content\n", "utf8")
  const eventLog = createEventLog()
  const service = new WorkspaceService({
    rootDir,
    snapshotIdFactory: () => "snapshot_1"
  })

  const snapshot = await service.readSnapshot("src-app.txt", {
    sessionId: "session_files",
    eventLog,
    correlationId: "corr_files"
  })

  assert.equal(snapshot.snapshotId, "snapshot_1")
  assert.equal(snapshot.path, "src-app.txt")
  assert.equal(snapshot.content, "old content\n")
  assert.match(snapshot.checksum, /^sha256:/)

  const events = await eventLog.listSessionEvents("session_files")
  assert.deepEqual(events[0].payload, {
    snapshotId: "snapshot_1",
    path: "src-app.txt",
    checksum: snapshot.checksum
  })
  assert.equal(events[0].correlationId, "corr_files")
})

test("PatchService proposes replacements and WorkspaceService commits matching patches", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "myhanako-workspace-"))
  await writeFile(join(rootDir, "notes.md"), "before\n", "utf8")
  const eventLog = createEventLog()
  const patchStore = new InMemoryPatchStore()
  const workspace = new WorkspaceService({
    rootDir,
    patchStore,
    snapshotIdFactory: () => "snapshot_1"
  })
  const patches = new PatchService({
    patchStore,
    patchIdFactory: () => "patch_1"
  })

  const snapshot = await workspace.readSnapshot("notes.md")
  const patch = await patches.proposeReplacement(
    {
      snapshot,
      newContent: "after\n",
      summary: "Update note text."
    },
    {
      sessionId: "session_files",
      eventLog
    }
  )
  const committed = await workspace.commitPatch("patch_1", {
    sessionId: "session_files",
    eventLog
  })

  assert.equal(patch.patchId, "patch_1")
  assert.equal(patch.oldChecksum, snapshot.checksum)
  assert.match(patch.newChecksum, /^sha256:/)
  assert.deepEqual(committed, {
    patchId: "patch_1",
    path: "notes.md",
    checksum: patch.newChecksum
  })
  assert.equal(await readFile(join(rootDir, "notes.md"), "utf8"), "after\n")

  const events = await eventLog.listSessionEvents("session_files")
  assert.deepEqual(
    events.map((event) => event.type),
    ["file_patch_proposed", "file_write_committed"]
  )
  assert.deepEqual(events[0].payload, {
    patchId: "patch_1",
    snapshotId: "snapshot_1",
    path: "notes.md",
    oldChecksum: snapshot.checksum,
    newChecksum: patch.newChecksum,
    summary: "Update note text."
  })
  assert.deepEqual(events[1].payload, {
    patchId: "patch_1",
    path: "notes.md",
    checksum: patch.newChecksum
  })
})

test("WorkspaceService rejects paths outside the workspace root", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "myhanako-workspace-"))
  const service = new WorkspaceService({ rootDir })

  await assert.rejects(
    service.readSnapshot("../outside.txt"),
    /Path escapes workspace root: ..\/outside.txt/
  )
})

test("WorkspaceService rejects stale patches before writing", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "myhanako-workspace-"))
  const filePath = join(rootDir, "notes.md")
  await writeFile(filePath, "before\n", "utf8")
  const patchStore = new InMemoryPatchStore()
  const workspace = new WorkspaceService({
    rootDir,
    patchStore,
    snapshotIdFactory: () => "snapshot_1"
  })
  const patches = new PatchService({
    patchStore,
    patchIdFactory: () => "patch_1"
  })

  const snapshot = await workspace.readSnapshot("notes.md")
  await patches.proposeReplacement({
    snapshot,
    newContent: "after\n"
  })
  await writeFile(filePath, "changed elsewhere\n", "utf8")

  await assert.rejects(
    workspace.commitPatch("patch_1"),
    /Patch base checksum mismatch: notes.md/
  )
  assert.equal(await readFile(filePath, "utf8"), "changed elsewhere\n")
})

function createEventLog(): SessionEventLog {
  return new SessionEventLog({
    store: new InMemorySessionEventStore(),
    clock: () => new Date("2026-05-29T00:00:00.000Z"),
    idFactory: (event) => `evt_${event.sequence}`
  })
}