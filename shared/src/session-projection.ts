import { compareSessionEvents, type SessionEvent } from "./session-events.ts"

export type TranscriptRole = "user" | "assistant"

export type TranscriptMessage = {
  readonly messageId: string
  readonly role: TranscriptRole
  readonly content: string
  readonly eventIds: readonly string[]
  readonly startedAt: string
  readonly completedAt?: string
  readonly recalled: boolean
}

type MutableTranscriptMessage = {
  messageId: string
  role: TranscriptRole
  content: string
  eventIds: string[]
  startedAt: string
  completedAt?: string
  recalled: boolean
}

export function projectSessionTranscript(events: readonly SessionEvent[]): readonly TranscriptMessage[] {
  const messages = new Map<string, MutableTranscriptMessage>()

  for (const event of [...events].sort(compareSessionEvents)) {
    switch (event.type) {
      case "user_message_created": {
        messages.set(event.payload.messageId, {
          messageId: event.payload.messageId,
          role: "user",
          content: event.payload.content,
          eventIds: [event.id],
          startedAt: event.timestamp,
          recalled: false
        })
        break
      }

      case "assistant_stream_started": {
        messages.set(event.payload.messageId, {
          messageId: event.payload.messageId,
          role: "assistant",
          content: "",
          eventIds: [event.id],
          startedAt: event.timestamp,
          recalled: false
        })
        break
      }

      case "assistant_delta_received": {
        const existing = messages.get(event.payload.messageId)
        if (existing) {
          existing.content += event.payload.delta
          existing.eventIds.push(event.id)
        }
        break
      }

      case "assistant_message_completed": {
        const existing = messages.get(event.payload.messageId)
        if (existing) {
          existing.content = event.payload.content
          existing.completedAt = event.timestamp
          existing.eventIds.push(event.id)
        }
        break
      }

      case "message_recalled": {
        const existing = messages.get(event.payload.targetMessageId)
        if (existing) {
          existing.recalled = true
          existing.eventIds.push(event.id)
        }
        break
      }
    }
  }

  return [...messages.values()].map((message) => ({
    messageId: message.messageId,
    role: message.role,
    content: message.content,
    eventIds: [...message.eventIds],
    startedAt: message.startedAt,
    completedAt: message.completedAt,
    recalled: message.recalled
  }))
}
