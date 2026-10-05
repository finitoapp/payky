import { createEnv } from "@t3-oss/env-core"
import { decode } from "nostr-tools/nip19"
import { z } from "zod"

import { NostrSecretKey } from "@/core/modules/shared/key-derivation.ts"

const NsecSchema = z.string().transform((value, context) => {
  try {
    const decoded = decode(value.trim())
    if (decoded.type === "nsec")
      return NostrSecretKey(new Uint8Array(decoded.data))
  } catch {
    // Reported below.
  }
  context.addIssue({ code: "custom", message: "Not an nsec." })
  return z.NEVER
})

/** The providers `bin/support-bot.ts` registers, by their API key. */
export const supportBotProviderKeys = {
  anthropic: "ANTHROPIC_API_KEY",
  google: "GOOGLE_GENERATIVE_AI_API_KEY",
} as const
type SupportBotProvider = keyof typeof supportBotProviderKeys

/** `provider:model`, as the provider registry names a model. */
const ModelIdSchema = z
  .string()
  .regex(
    /^(anthropic|google):\S+$/u,
    "Only the anthropic and google providers are registered."
  )
  .transform((value) => value as `${SupportBotProvider}:${string}`)

const modelVariables = [
  "PAYKY_BOT_MODEL_TRIAGE",
  "PAYKY_BOT_MODEL_DOCS",
  "PAYKY_BOT_MODEL_CODE",
] as const

const LimitSchema = z.coerce.number().int().positive()

export const supportBotEnv = createEnv({
  server: {
    /** The bot's own key: a member of the support team (support/0004). */
    PAYKY_BOT_NSEC: NsecSchema,
    /** Required only for the providers the models below use. */
    ANTHROPIC_API_KEY: z.string().trim().min(1).optional(),
    GOOGLE_GENERATIVE_AI_API_KEY: z.string().trim().min(1).optional(),
    /** The public repository the bot reads the docs and the code from. */
    PAYKY_BOT_REPO_URL: z
      .url()
      .default("https://github.com/finitoapp/payky.git"),
    /** Where the bot keeps its clone, apart from the code it runs from. */
    PAYKY_BOT_REPO_DIR: z
      .string()
      .trim()
      .min(1)
      .default(".data/support-bot/repo"),
    PAYKY_BOT_MODEL_TRIAGE: ModelIdSchema.default("anthropic:claude-haiku-4-5"),
    PAYKY_BOT_MODEL_DOCS: ModelIdSchema.default("anthropic:claude-haiku-4-5"),
    PAYKY_BOT_MODEL_CODE: ModelIdSchema.default("anthropic:claude-sonnet-5-5"),
    PAYKY_BOT_REPLIES_PER_ACCOUNT: LimitSchema.default(10),
    PAYKY_BOT_CODE_REPLIES_PER_ACCOUNT: LimitSchema.default(3),
    PAYKY_BOT_CODE_REPLIES: LimitSchema.default(30),
  },
  // Every model's provider needs its key.
  createFinalSchema: (shape) =>
    z.object(shape).superRefine((env, context) => {
      for (const variable of modelVariables) {
        const [provider] = env[variable].split(":") as [SupportBotProvider]
        const key = supportBotProviderKeys[provider]
        if (env[key] === undefined) {
          context.addIssue({
            code: "custom",
            path: [key],
            message: `${variable} uses ${provider}, which needs ${key}.`,
          })
        }
      }
    }),
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
})
