import { createEnv } from "@t3-oss/env-core"
import { z } from "zod"

export const appEnv = createEnv({
  clientPrefix: "VITE_",
  client: { VITE_PAYKY_API_BASE_URL: z.url().optional() },
  runtimeEnv: import.meta.env,
  emptyStringAsUndefined: true,
})

export const apiUrl = (pathname: string): string =>
  new URL(
    pathname,
    appEnv.VITE_PAYKY_API_BASE_URL ??
      globalThis.location?.origin ??
      "https://payky.me"
  ).href
