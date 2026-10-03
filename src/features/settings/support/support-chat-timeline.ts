import { isSameDay } from "date-fns"

import type { SupportMessage } from "@/core/integrations/nostr/nostr-support-chat.ts"

/** A message as the chat shows it, including one still on its way. */
export interface ChatEntry extends SupportMessage {
  readonly status: "sent" | "sending" | "failed"
  /** The emoji it got, each once, in the order they came. */
  readonly reactions: ReadonlyArray<string>
}

/**
 * The delivered messages as the chat shows them, each with the reactions
 * to it (support/0002). What its author deleted is gone, a deleted message's
 * reactions with it (NIP-09: a deletion counts only for its author's own
 * events). A reaction to a message the chat does not hold is not shown.
 */
export const toChatEntries = (
  messages: ReadonlyArray<SupportMessage>
): ReadonlyArray<ChatEntry> => {
  const deleted = new Set(
    messages
      .filter((message) => message.type === "deletion")
      .flatMap(({ author, refersTo }) =>
        refersTo.map((id) => `${author}:${id}`)
      )
  )
  const kept = messages.filter(
    (message) => !deleted.has(`${message.author}:${message.id}`)
  )
  const reactions = new Map<string, ReadonlyArray<string>>()
  for (const { type, refersTo, text } of kept) {
    const [target] = refersTo
    if (type !== "reaction" || target === undefined) continue
    const current = reactions.get(target) ?? []
    if (!current.includes(text)) reactions.set(target, [...current, text])
  }
  return kept
    .filter((message) => message.type === "message")
    .map((message) => ({
      ...message,
      status: "sent",
      reactions: reactions.get(message.id) ?? [],
    }))
}

export type TimelineItem =
  | { readonly kind: "day"; readonly key: string; readonly date: Date }
  | {
      readonly kind: "message"
      readonly key: string
      readonly entry: ChatEntry
      /** First of a run by one author: the bubble shows the author's name. */
      readonly firstOfGroup: boolean
      /** Last of a run: the bubble keeps its pointed corner and the gap after. */
      readonly lastOfGroup: boolean
    }

/** Messages by one author closer together than this read as one run. */
const GROUP_WINDOW_SECONDS = 5 * 60

const sameRun = (a: ChatEntry | undefined, b: ChatEntry | undefined) =>
  a !== undefined &&
  b !== undefined &&
  a.author === b.author &&
  Math.abs(b.sentAt - a.sentAt) <= GROUP_WINDOW_SECONDS &&
  isSameDay(a.sentAt * 1000, b.sentAt * 1000)

/**
 * The conversation as messenger apps lay it out: a heading before each day,
 * consecutive messages from one author grouped into a run.
 */
export const buildTimeline = (
  entries: ReadonlyArray<ChatEntry>
): ReadonlyArray<TimelineItem> =>
  entries.flatMap((entry, index): ReadonlyArray<TimelineItem> => {
    const previous = entries[index - 1]
    const next = entries[index + 1]
    const date = new Date(entry.sentAt * 1000)
    const message: TimelineItem = {
      kind: "message",
      key: entry.id,
      entry,
      firstOfGroup: !sameRun(previous, entry),
      lastOfGroup: !sameRun(entry, next),
    }
    return previous !== undefined && isSameDay(previous.sentAt * 1000, date)
      ? [message]
      : [{ kind: "day", key: `day-${entry.id}`, date }, message]
  })
