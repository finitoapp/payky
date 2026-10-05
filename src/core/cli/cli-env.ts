import { createEnv } from "@t3-oss/env-core"
import { z } from "zod"

export const cliEnv = createEnv({
  server: {
    PAYKY_SQLITE_PATH: z.string().trim().min(1).default(".data/payky.db"),
    // Payky's AI proxy (ai/0001), or any OpenAI-compatible endpoint such as
    // a local Ollama at http://localhost:11434/v1.
    PAYKY_AI_BASE_URL: z.url().default("https://payky.me/api/ai/v1"),
    // The proxy picks its own model; another endpoint needs one named.
    PAYKY_AI_MODEL: z.string().trim().min(1).optional(),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
})
