import { createEnv } from "@t3-oss/env-core"
import { z } from "zod"
export const testEnv = createEnv({
  server: { CASHU_LIVE: z.stringbool().default(false) },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
})
