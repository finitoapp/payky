import { createEnv } from "@t3-oss/env-core"
import { z } from "zod"

export const appEnv = createEnv({
  clientPrefix: "VITE_",
  client: {
    // Absolute, because the native app's origin is https://localhost and has
    // no /api of its own to resolve a relative path against.
    VITE_PAYKY_API_BASE_URL: z.url().default("https://payky.me"),
  },
  runtimeEnv: import.meta.env,
  emptyStringAsUndefined: true,
})
