import assert from "node:assert/strict"
import { mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"
import {
  createFileDiffCard,
  projectFileDiffCards,
  projectTerminalCards,
  recordTerminalRuntimeEvent
} from "../src/enhancement-projection.ts"
import {
  InMemorySessionEventStore,
  SessionEventLog
} from "../src/session-event-log.ts"
import {
  InMemoryPatchStore,
  PatchService,
  WorkspaceService
} from "../src/workspace-service.ts"

test("file diff projection turns patch events and diff models into FileDiffCard data", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "myhanako-diff-card-"))
  await writeFile(join(rootDir, "README.md"), "before\n", "utf8")
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

  const snapshot = await workspace.readSnapshot("README.md")
  const patch = await patches.proposeReplacement(
    {
      snapshot,
      newContent: "after\n",
      summary: "Update README"
    },
    {
      sessionId: "session_diff",
      eventLog
    }
  )
  const diffCard = createFileDiffCard(patch)
  const eventsBeforeCommit = await eventLog.listSessionEvents("session_diff")
  const projectedBeforeCommit = projectFileDiffCards(
    eventsBeforeCommit,
    new Map([[patch.patchId, diffCard.diff!]])
  )

  assert.equal(projectedBeforeCommit[0].type, "file_diff")
  assert.equal(projectedBeforeCommit[0].status, "proposed")
  assert.equal(projectedBeforeCommit[0].diff?.hunks.length, 1)

  await workspace.commitPatch("patch_1", {
    sessionId: "session_diff",
    eventLog
  })
  const projectedAfterCommit = projectFileDiffCards(
    await eventLog.listSessionEvents("session_diff"),
    new Map([[patch.patchId, diffCard.diff!]])
  )
  assert.equal(projectedAfterCommit[0].status, "committed")
  assert.deepEqual(projectedAfterCommit[0].eventIds, ["evt_1", "evt_2"])
})

test("terminal projection normalizes output and preserves ordered terminal card chunks", async () => {
  const eventLog = createEventLog()

  await recordTerminalRuntimeEvent({
    eventLog,
    sessionId: "session_terminal",
    event: {
      type: "terminal_started",
      terminalId: "term_1",
      command: "npm test",
      cwd: "F:\\workspace"
    }
  })
  await recordTerminalRuntimeEvent({
    eventLog,
    sessionId: "session_terminal",
    event: {
      type: "terminal_output",
      terminalId: "term_1",
      seq: 2,
      stream: "stderr",
      data: "\u001b[31mfailed\r\n"
    }
  })
  await recordTerminalRuntimeEvent({
    eventLog,
    sessionId: "session_terminal",
    event: {
      type: "terminal_output",
      terminalId: "term_1",
      seq: 1,
      data: "start\r"
    }
  })
  await recordTerminalRuntimeEvent({
    eventLog,
    sessionId: "session_terminal",
    event: {
      type: "terminal_exited",
      terminalId: "term_1",
      exitCode: 1
    }
  })

  const cards = projectTerminalCards(await eventLog.listSessionEvents("session_terminal"))
  assert.equal(cards[0].type, "terminal")
  assert.equal(cards[0].processId, "term_1")
  assert.equal(cards[0].status, "exited")
  assert.equal(cards[0].exitCode, 1)
  assert.deepEqual(
    cards[0].output.map((chunk) => [chunk.sequence, chunk.stream, chunk.normalizedText]),
    [
      [1, "stdout", "start\n"],
      [2, "stderr", "failed\n"]
    ]
  )
})

function createEventLog(): SessionEventLog {
  return new SessionEventLog({
    store: new InMemorySessionEventStore(),
    clock: () => new Date("2026-05-31T00:00:00.000Z"),
    idFactory: (event) => `evt_${event.sequence}`
  })
}
