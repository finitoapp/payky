import { Capacitor } from "@capacitor/core"
import { createEnv } from "@t3-oss/env-core"
import { z } from "zod"

export const appEnv = createEnv({
  clientPrefix: "VITE_",
  client: {
    // Origin of the /api serverless functions, read through `apiUrl`. Unset
    // means the page's own origin, so every deployment calls its own /api.
    VITE_PAYKY_API_BASE_URL: z.url().optional(),
    VITE_PAYKY_EET_PRODUCTION_URL: z.url().optional(),
    // Where the donations page sends sats.
    VITE_PAYKY_DONATE_LUD16_ADDRESS: z.string().default("donate@payky.me"),
    // Where the account's Nostr profile is read from and published to.
    // Linky's defaults, so both apps see the same profile.
    VITE_PAYKY_NOSTR_RELAYS: z
      .string()
      .transform((value) => value.split(",").map((url) => url.trim()))
      .pipe(z.array(z.url({ protocol: /^wss?$/u })).min(1))
      .default([
        "wss://relay.damus.io",
        "wss://nos.lol",
        "wss://relay.0xchat.com",
        "wss://nostr.linky.fit",
      ]),
    // Unset leaves error reporting unavailable, whatever the device opted.
    VITE_SENTRY_DSN: z.string().optional(),
  },
  runtimeEnv: import.meta.env,
  emptyStringAsUndefined: true,
})

/**
 * An absolute URL of `path` on this app's own API. The web calls the
 * deployment it was served from; the native app, whose origin is
 * https://localhost with no /api of its own, and code running without a page
 * (Vitest, the landing prerender) call payky.me. `VITE_PAYKY_API_BASE_URL`
 * overrides both, which is how `bun run dev`, served without /api, reaches one.
 */
export const apiUrl = (path: string): string =>
  new URL(
    path,
    appEnv.VITE_PAYKY_API_BASE_URL ??
      (Capacitor.isNativePlatform() || typeof window === "undefined"
        ? "https://payky.me"
        : window.location.origin)
  ).toString()
