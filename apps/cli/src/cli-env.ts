import { createEnv } from "@t3-oss/env-core"
import { z } from "zod"
import { resolveSqlitePath } from "./paths.ts"

export const cliEnv = createEnv({
  server: {
    PAYKY_SQLITE_PATH: z
      .string()
      .trim()
      .min(1)
      .optional()
      .transform((value) => resolveSqlitePath(value, process.cwd())),
    // Payky's AI proxy (ai/0001), or any OpenAI-compatible endpoint such as
    // a local Ollama at http://localhost:11434/v1.
    PAYKY_AI_BASE_URL: z.url().default("https://payky.me/api/ai/v1"),
    // The proxy picks its own model; another endpoint needs one named.
    PAYKY_AI_MODEL: z.string().trim().min(1).optional(),
    // Runs the one Cashu test against the public test mint (cashu.md, phase 2).
    CASHU_LIVE: z.stringbool().default(false),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
})
