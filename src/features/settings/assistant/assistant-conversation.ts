import type { OwnerId } from "@evolu/common"
import type { ModelMessage } from "ai"
import { atom } from "jotai"

/** One question and the assistant's reply to it. */
export interface AssistantTurn {
  readonly id: string
  readonly question: string
  readonly reply: string
  /**
   * `answering` while the reply streams in, `stopped` when the merchant
   * stopped it or left the page, `failed` when the request failed.
   */
  readonly status: "answering" | "answered" | "stopped" | "failed"
}

/**
 * The conversation, in memory only (ai/0002): it outlives leaving the page
 * but not a reload. It belongs to the account it was held with, so switching
 * accounts starts afresh rather than showing one account's answers in another.
 */
export const assistantConversationAtom = atom<{
  readonly ownerId: OwnerId | null
  readonly turns: ReadonlyArray<AssistantTurn>
}>({ ownerId: null, turns: [] })

/**
 * The conversation as the model reads it, with `question` asked last. A
 * failed turn is left out, question and all: it has no reply, and the
 * merchant asks it again with a retry.
 */
export const toAssistantMessages = (
  turns: ReadonlyArray<AssistantTurn>,
  question: string
): ReadonlyArray<ModelMessage> => [
  ...turns
    .filter((turn) => turn.status !== "failed" && turn.reply !== "")
    .flatMap(
      (turn): ReadonlyArray<ModelMessage> => [
        { role: "user", content: turn.question },
        { role: "assistant", content: turn.reply },
      ]
    ),
  { role: "user", content: question },
]
