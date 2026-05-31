import assert from "node:assert/strict"
import { readdirSync, readFileSync, statSync } from "node:fs"
import path from "node:path"
import test from "node:test"

const repoRoot = path.resolve(import.meta.dirname, "..", "..")
const allowedDirectImportPrefixes = [
  path.join(repoRoot, "lib", "pi-sdk"),
  path.join(repoRoot, "lib", "test")
]

test("production code imports Pi SDK only through lib/pi-sdk", () => {
  const offenders: string[] = []

  for (const file of listTypescriptFiles(repoRoot)) {
    const normalizedFile = path.normalize(file)
    if (allowedDirectImportPrefixes.some((prefix) => normalizedFile.startsWith(prefix))) {
      continue
    }

    const source = readFileSync(file, "utf8")
    if (source.includes("@mariozechner/pi-")) {
      offenders.push(path.relative(repoRoot, file))
    }
  }

  assert.deepEqual(offenders, [])
})

function listTypescriptFiles(dir: string): string[] {
  const entries = readdirSync(dir)
  const files: string[] = []

  for (const entry of entries) {
    if (entry === "node_modules" || entry === ".git") {
      continue
    }

    const fullPath = path.join(dir, entry)
    const stat = statSync(fullPath)
    if (stat.isDirectory()) {
      files.push(...listTypescriptFiles(fullPath))
    } else if (entry.endsWith(".ts")) {
      files.push(fullPath)
    }
  }

  return files
}
