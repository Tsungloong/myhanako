import { createHash } from "node:crypto"
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http"
import type { Socket } from "node:net"
import { URL } from "node:url"
import type { SessionEvent, SessionEventFilter } from "../../shared/src/session-events.ts"
import {
  appendSessionStreamEvent,
  beginSessionStream,
  createSessionStreamState,
  finishSessionStream,
  resumeSessionStream,
  type SessionStreamState
} from "./session-stream-store.ts"

export type LocalServerEngine = {
  readonly createSession: (options: unknown) => Promise<unknown>
  readonly recoverSession: (options: unknown) => Promise<unknown>
  readonly sendMessage?: (options: unknown) => Promise<unknown>
  readonly interruptCurrentSession?: (options?: unknown) => Promise<unknown>
  readonly disposeCurrentSession?: (reason?: string) => Promise<void>
  readonly modelManager?: unknown
}

export type LocalServerEventLog = {
  readonly list?: (filter?: SessionEventFilter) => Promise<readonly SessionEvent[]>
}

export type LocalServerInspector = {
  readonly getSessionSnapshot: (sessionId: string) => Promise<unknown>
}

export type LocalServerOptions = {
  readonly engine: LocalServerEngine
  readonly eventLog?: LocalServerEventLog
  readonly inspector?: LocalServerInspector
}

export type LocalServerAddress = {
  readonly port: number
  readonly url: string
  readonly wsUrl: string
}

type WebSocketClient = {
  readonly socket: Socket
}

export class LocalMyHanakoServer {
  readonly #engine: LocalServerEngine
  readonly #eventLog?: LocalServerEventLog
  readonly #inspector?: LocalServerInspector
  readonly #server: Server
  readonly #clients = new Set<WebSocketClient>()
  readonly #streamStates = new Map<string, SessionStreamState>()

  constructor(options: LocalServerOptions) {
    this.#engine = options.engine
    this.#eventLog = options.eventLog
    this.#inspector = options.inspector
    this.#server = createServer((request, response) => {
      void this.#handleRequest(request, response)
    })
    this.#server.on("upgrade", (request, socket) => {
      this.#handleUpgrade(request, socket)
    })
  }

  async listen(port = 0, host = "127.0.0.1"): Promise<LocalServerAddress> {
    await new Promise<void>((resolve) => {
      this.#server.listen(port, host, resolve)
    })
    const address = this.#server.address()
    if (!address || typeof address === "string") {
      throw new Error("LocalMyHanakoServer did not bind to a TCP address")
    }
    return {
      port: address.port,
      url: `http://${host}:${address.port}`,
      wsUrl: `ws://${host}:${address.port}`
    }
  }

  async close(): Promise<void> {
    for (const client of this.#clients) {
      client.socket.destroy()
    }
    this.#clients.clear()
    await new Promise<void>((resolve, reject) => {
      this.#server.close((error) => {
        if (error) {
          reject(error)
          return
        }
        resolve()
      })
    })
  }

  publish(event: unknown): void {
    const sessionId = sessionIdFromEvent(event)
    const payload = JSON.stringify(sessionId ? this.#projectStreamEvent(sessionId, event) : event)
    for (const client of this.#clients) {
      sendWebSocketText(client.socket, payload)
    }
  }

  #projectStreamEvent(sessionId: string, event: unknown): unknown {
    const state = this.#getStreamState(sessionId)
    const eventType = eventTypeOf(event)
    if (
      eventType === "session_status" &&
      boolField(event, "isStreaming") === true &&
      !state.isStreaming
    ) {
      beginSessionStream(state)
    }

    const entry = appendSessionStreamEvent(state, event)
    const projected = {
      ...(event && typeof event === "object" ? event as Record<string, unknown> : { event }),
      sessionPath: sessionId,
      streamId: entry.streamId,
      seq: entry.seq
    }

    if (
      eventType === "turn_end" ||
      (eventType === "session_status" && boolField(event, "isStreaming") === false)
    ) {
      finishSessionStream(state)
    }
    return projected
  }

  #getStreamState(sessionId: string): SessionStreamState {
    const existing = this.#streamStates.get(sessionId)
    if (existing) {
      return existing
    }
    const state = createSessionStreamState()
    this.#streamStates.set(sessionId, state)
    return state
  }

  async #handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const url = new URL(request.url ?? "/", "http://127.0.0.1")
    try {
      if (request.method === "GET" && url.pathname === "/health") {
        writeJson(response, 200, { ok: true })
        return
      }
      if (request.method === "GET" && url.pathname === "/models") {
        writeJson(response, 200, { models: readAvailableModels(this.#engine.modelManager) })
        return
      }
      if (request.method === "GET" && url.pathname === "/events") {
        const filter = readEventFilter(url)
        const events = await this.#eventLog?.list?.(filter) ?? []
        writeJson(response, 200, { events })
        return
      }
      if (request.method === "GET" && url.pathname === "/events/resume") {
        const sessionId = url.searchParams.get("sessionId")
        if (!sessionId) {
          writeJson(response, 400, { error: "sessionId is required" })
          return
        }
        writeJson(response, 200, {
          type: "stream_resume",
          sessionPath: sessionId,
          ...resumeSessionStream(this.#getStreamState(sessionId), {
            streamId: url.searchParams.get("streamId"),
            sinceSeq: numberParam(url.searchParams.get("sinceSeq"))
          })
        })
        return
      }
      if (request.method === "GET" && url.pathname === "/inspector") {
        const sessionId = url.searchParams.get("sessionId")
        if (!sessionId) {
          writeJson(response, 400, { error: "sessionId is required" })
          return
        }
        if (!this.#inspector) {
          writeJson(response, 501, { error: "inspector unavailable" })
          return
        }
        writeJson(response, 200, await this.#inspector.getSessionSnapshot(sessionId))
        return
      }
      if (request.method === "POST" && url.pathname === "/sessions/create") {
        writeJson(response, 200, summarizeSessionState(await this.#engine.createSession(await readJson(request))))
        return
      }
      if (request.method === "POST" && url.pathname === "/sessions/open") {
        writeJson(response, 200, summarizeSessionState(await this.#engine.recoverSession(await readJson(request))))
        return
      }
      if (request.method === "POST" && url.pathname === "/sessions/send") {
        if (!this.#engine.sendMessage) {
          writeJson(response, 501, { error: "sendMessage unavailable" })
          return
        }
        writeJson(response, 200, await this.#engine.sendMessage(await readJson(request)))
        return
      }
      if (request.method === "POST" && url.pathname === "/sessions/interrupt") {
        if (!this.#engine.interruptCurrentSession) {
          writeJson(response, 501, { error: "interrupt unavailable" })
          return
        }
        writeJson(response, 200, await this.#engine.interruptCurrentSession(await readJson(request)))
        return
      }

      writeJson(response, 404, { error: "not found" })
    } catch (error) {
      writeJson(response, 500, {
        error: error instanceof Error ? error.message : String(error)
      })
    }
  }

  #handleUpgrade(request: IncomingMessage, socket: Socket): void {
    const url = new URL(request.url ?? "/", "http://127.0.0.1")
    if (url.pathname !== "/events") {
      socket.destroy()
      return
    }

    const key = request.headers["sec-websocket-key"]
    if (typeof key !== "string") {
      socket.destroy()
      return
    }

    const accept = createHash("sha1")
      .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
      .digest("base64")
    socket.write([
      "HTTP/1.1 101 Switching Protocols",
      "Upgrade: websocket",
      "Connection: Upgrade",
      `Sec-WebSocket-Accept: ${accept}`,
      "",
      ""
    ].join("\r\n"))

    const client = { socket }
    this.#clients.add(client)
    socket.on("close", () => this.#clients.delete(client))
    socket.on("error", () => this.#clients.delete(client))
  }
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  const raw = Buffer.concat(chunks).toString("utf8")
  return raw.length > 0 ? JSON.parse(raw) : {}
}

function writeJson(response: ServerResponse, statusCode: number, body: unknown): void {
  const payload = JSON.stringify(body)
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload)
  })
  response.end(payload)
}

function readEventFilter(url: URL): SessionEventFilter {
  const sessionId = url.searchParams.get("sessionId") ?? undefined
  const afterSequenceRaw = url.searchParams.get("afterSequence")
  const limitRaw = url.searchParams.get("limit")
  return {
    sessionId,
    afterSequence: afterSequenceRaw ? Number(afterSequenceRaw) : undefined,
    limit: limitRaw ? Number(limitRaw) : undefined
  }
}

function summarizeSessionState(value: unknown): unknown {
  if (!value || typeof value !== "object") {
    return value
  }
  const state = value as { readonly sessionId?: unknown; readonly sessionManager?: { readonly getSessionFile?: () => string | null } }
  return {
    sessionId: typeof state.sessionId === "string"
      ? state.sessionId
      : state.sessionManager?.getSessionFile?.() ?? null
  }
}

function readAvailableModels(modelManager: unknown): readonly unknown[] {
  if (!modelManager || typeof modelManager !== "object") {
    return []
  }
  const candidate = modelManager as { readonly availableModels?: unknown }
  return Array.isArray(candidate.availableModels)
    ? candidate.availableModels
    : []
}

function sessionIdFromEvent(event: unknown): string | null {
  if (!event || typeof event !== "object") {
    return null
  }
  const candidate = event as { readonly sessionId?: unknown; readonly sessionPath?: unknown }
  if (typeof candidate.sessionId === "string" && candidate.sessionId.length > 0) {
    return candidate.sessionId
  }
  if (typeof candidate.sessionPath === "string" && candidate.sessionPath.length > 0) {
    return candidate.sessionPath
  }
  return null
}

function eventTypeOf(event: unknown): string | undefined {
  return event && typeof event === "object" && typeof (event as { readonly type?: unknown }).type === "string"
    ? (event as { readonly type: string }).type
    : undefined
}

function boolField(event: unknown, key: string): boolean | undefined {
  if (!event || typeof event !== "object") {
    return undefined
  }
  const value = (event as Record<string, unknown>)[key]
  return typeof value === "boolean" ? value : undefined
}

function numberParam(value: string | null): number | undefined {
  if (value === null || value.length === 0) {
    return undefined
  }
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : undefined
}

function sendWebSocketText(socket: Socket, text: string): void {
  if (!socket.writable) {
    return
  }

  const payload = Buffer.from(text, "utf8")
  let header: Buffer
  if (payload.length < 126) {
    header = Buffer.from([0x81, payload.length])
  } else if (payload.length <= 0xffff) {
    header = Buffer.alloc(4)
    header[0] = 0x81
    header[1] = 126
    header.writeUInt16BE(payload.length, 2)
  } else {
    header = Buffer.alloc(10)
    header[0] = 0x81
    header[1] = 127
    header.writeBigUInt64BE(BigInt(payload.length), 2)
  }
  socket.write(Buffer.concat([header, payload]))
}
