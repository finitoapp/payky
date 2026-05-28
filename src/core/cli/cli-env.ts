import { createEnv } from "@t3-oss/env-core"
import { z } from "zod"

export const cliEnv = createEnv({
  server: {
    PAYKY_SQLITE_PATH: z.string().trim().min(1).default("payky.db"),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
})
