import assert from "node:assert/strict"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import test from "node:test"

const execFileAsync = promisify(execFile)

test("P1 MVP smoke script validates UI assets and core routes", async () => {
  const { stdout } = await execFileAsync(
    process.execPath,
    ["scripts/p1-mvp-smoke.mjs"],
    {
      cwd: process.cwd()
    }
  )

  const result = JSON.parse(stdout)
  assert.equal(result.ok, true)
  assert.deepEqual(result.checks, [
    "standalone-ui",
    "embedded-route",
    "lab-action-api",
    "workflow-review-api",
    "draft-api",
    "bundle-api",
    "docs"
  ])
})
