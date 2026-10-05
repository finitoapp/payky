import {
  generateText,
  isStepCount,
  type LanguageModel,
  type LanguageModelUsage,
  type ModelMessage,
  Output,
  type SystemModelMessage,
  type ToolSet,
} from "ai"
import { z } from "zod"

import {
  type SupportClientInfo,
  stripClientTrailer,
} from "@/core/integrations/nostr/nostr-support-chat.ts"
import type { BotMessage } from "@/core/support-bot/support-bot-policy.ts"
import type { RepoFile } from "@/core/support-bot/support-bot-repo.ts"

/**
 * The models behind the support bot (support/0004). A cheap one triages
 * every message; the answer comes from the model of the depth the question
 * needs. Which model sits in each slot is configuration, so a provider or a
 * model changes without a code change.
 */
export interface SupportBotModels {
  readonly triage: LanguageModel
  readonly docs: LanguageModel
  readonly code: LanguageModel
}

export type AnswerDepth = "docs" | "code"

const TriageSchema = z.object({
  action: z
    .enum(["ignore", "answer", "escalate"])
    .describe(
      "ignore: nothing to answer, such as thanks or an acknowledgement. answer: a question about using or the behaviour of the Payky app. escalate: needs a person."
    ),
  depth: z
    .enum(["docs", "code"])
    .describe(
      "docs: the documentation is likely enough. code: needs exact behaviour, an edge case or a suspected bug, so the source code must be read."
    ),
  escalationMessage: z
    .string()
    .describe(
      "Only for escalate: one or two sentences in the merchant's language saying a colleague from support will take over. Otherwise empty."
    ),
})
export type Triage = z.output<typeof TriageSchema>

const ReplySchema = z.object({
  message: z
    .string()
    .describe("The reply to the merchant, in the merchant's language."),
  escalate: z
    .boolean()
    .describe(
      "true when the merchant needs a person: the reply then says a colleague from support will take over."
    ),
})
export type Reply = z.output<typeof ReplySchema>

const ROLE = `You are the support assistant of Payky, a point-of-sale app for merchants (bills, payments in cash, by card, Lightning and bank transfer, EET reporting). You answer merchants in Payky's support chat. A merchant writes from inside the app; human colleagues from support read the same chat.`

const RULES = `Rules:
- Always answer in the language the merchant writes in.
- Be brief and concrete, as in a chat: a few sentences, steps as a short list when needed. Plain text, no Markdown headings or tables.
- Describe what the merchant sees and does in the app. Do not quote code, file names or internal names unless the merchant asks for them.
- Never ask for or accept a recovery phrase, a private key or a password. If the merchant offers one, tell them never to share it.
- Never invent behaviour. If you are not sure, or the question needs a person (a refund, money that went missing, a specific payment or account, a complaint, anything outside the app), escalate.
- When you find that the app behaves differently from what the merchant reasonably expects and it looks like a bug, say so plainly, suggest a workaround if there is one, and escalate.`

const TRIAGE_INSTRUCTIONS = `${ROLE}

Classify the merchant's latest message in the conversation below. Answer nothing to the merchant yourself.`

const cachedInstructions = (content: string): SystemModelMessage => ({
  role: "system",
  content,
  // Anthropic caches everything up to here; other providers ignore it.
  providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } },
})

const docsBlock = (docs: ReadonlyArray<RepoFile>) =>
  `Payky's documentation follows. It describes how the app behaves and why.\n\n${docs
    .map(
      (file) => `<document path="${file.path}">\n${file.content}\n</document>`
    )
    .join("\n\n")}`

const clientNote = (client: SupportClientInfo | null) =>
  client === null
    ? "The merchant's app version is unknown."
    : `The merchant uses Payky ${client.version} on ${client.platform}.`

/**
 * The conversation as the model reads it: the merchant is the user and the
 * bot the assistant. Earlier messages of the bot are its own turns, so the
 * model continues rather than repeats itself.
 */
export const toModelMessages = (
  conversation: ReadonlyArray<BotMessage>,
  bot: string
): Array<ModelMessage> => {
  const messages = conversation.map(
    (message): ModelMessage =>
      message.author === bot
        ? { role: "assistant", content: message.text }
        : { role: "user", content: stripClientTrailer(message.text) }
  )
  // A conversation the model reads starts with the merchant.
  const firstUser = messages.findIndex((message) => message.role === "user")
  return firstUser === -1 ? [] : messages.slice(firstUser)
}

export interface ModelCall<T> {
  readonly value: T
  readonly usage: LanguageModelUsage
}

export const triageConversation = async ({
  model,
  messages,
}: {
  readonly model: LanguageModel
  readonly messages: Array<ModelMessage>
}): Promise<ModelCall<Triage>> => {
  const result = await generateText({
    model,
    instructions: TRIAGE_INSTRUCTIONS,
    messages,
    output: Output.object({ schema: TriageSchema }),
    maxOutputTokens: 2_000,
  })
  return { value: result.output, usage: result.totalUsage }
}

/** At most this many tool calls before the model must answer. */
export const MAX_CODE_STEPS = 15

/**
 * The reply. Both depths read the whole documentation, cached; the code
 * depth also gets the codebase's map and tools to read the code at the
 * merchant's revision.
 */
export const answerConversation = async ({
  model,
  messages,
  docs,
  client,
  code,
}: {
  readonly model: LanguageModel
  readonly messages: Array<ModelMessage>
  readonly docs: ReadonlyArray<RepoFile>
  readonly client: SupportClientInfo | null
  readonly code?: {
    readonly agentsGuide: string
    readonly exact: boolean
    readonly tools: ToolSet
  }
}): Promise<ModelCall<Reply>> => {
  const codeNote =
    code === undefined
      ? []
      : [
          {
            role: "system" as const,
            content: `You can read Payky's source code with the tools, at ${
              code.exact
                ? "the exact commit the merchant's app was built from"
                : "the newest commit, because the merchant's commit is unknown; behaviour may differ from their app"
            }. Look the behaviour up in the code before you answer, and stop once you know enough. The repository's guide for developers follows.\n\n${code.agentsGuide}`,
          },
        ]
  const result = await generateText({
    model,
    instructions: [
      cachedInstructions(`${ROLE}\n\n${RULES}\n\n${docsBlock(docs)}`),
      { role: "system", content: clientNote(client) },
      ...codeNote,
    ],
    messages,
    output: Output.object({ schema: ReplySchema }),
    maxOutputTokens: 16_000,
    ...(code === undefined
      ? {}
      : {
          tools: code.tools,
          // The structured answer is a step of its own.
          stopWhen: isStepCount(MAX_CODE_STEPS + 1),
        }),
  })
  return { value: result.output, usage: result.totalUsage }
}
