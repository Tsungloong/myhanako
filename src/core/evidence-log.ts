import { appendFile, mkdir, readFile } from "node:fs/promises"
import { dirname } from "node:path"
import {
  validateEvidenceEnvelope,
  type EvidenceEnvelope
} from "../shared/evidence.ts"

export class EvidenceLog {
  readonly #path: string

  constructor(path: string) {
    this.#path = path
  }

  async append(record: unknown): Promise<void> {
    const envelope = validateEvidenceEnvelope(record)
    await mkdir(dirname(this.#path), { recursive: true })
    await appendFile(this.#path, `${JSON.stringify(envelope)}\n`, "utf8")
  }

  async readAll(): Promise<readonly EvidenceEnvelope[]> {
    let content: string
    try {
      content = await readFile(this.#path, "utf8")
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") {
        return []
      }
      throw error
    }

    return content
      .split(/\r?\n/)
      .filter((line) => line.trim().length > 0)
      .map((line) => validateEvidenceEnvelope(JSON.parse(line)))
      .sort((left, right) => left.sequence - right.sequence)
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error
}
