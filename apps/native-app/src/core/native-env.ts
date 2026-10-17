import { createEnv } from "@t3-oss/env-core"
import { z } from "zod"

// Mirrors the web app's VITE_* client variables (apps/web-app/src/core/app-env.ts)
// that native needs. Expo inlines only static `process.env.EXPO_PUBLIC_X`
// references, so each one is listed explicitly in `runtimeEnv`.
export const nativeEnv = createEnv({
  clientPrefix: "EXPO_PUBLIC_",
  client: {
    // Native has no /api of its own, so the default is the production origin.
    EXPO_PUBLIC_PAYKY_API_BASE_URL: z.url().default("https://payky.me"),
    EXPO_PUBLIC_PAYKY_EET_PRODUCTION_URL: z.url().optional(),
    EXPO_PUBLIC_PAYKY_DONATE_LUD16_ADDRESS: z
      .string()
      .default("donate@payky.me"),
    EXPO_PUBLIC_PAYKY_NOSTR_RELAYS: z
      .string()
      .transform((value) => value.split(",").map((url) => url.trim()))
      .pipe(z.array(z.url({ protocol: /^wss?$/u })).min(1))
      .default([
        "wss://relay.damus.io",
        "wss://nos.lol",
        "wss://relay.0xchat.com",
        "wss://nostr.linky.fit",
      ]),
    EXPO_PUBLIC_LINKY_RELAYS_URL: z
      .url()
      .default("https://linky.fit/recommended-relays"),
    EXPO_PUBLIC_LINKY_EVOLU_RELAYS: z
      .string()
      .transform((value) => value.split(",").map((url) => url.trim()))
      .pipe(z.array(z.url({ protocol: /^wss$/u })).min(1))
      .default(["wss://evolu.eu.freedomrelay.dev", "wss://evolu.linky.fit"]),
    EXPO_PUBLIC_SENTRY_DSN: z.string().optional(),
  },
  runtimeEnv: {
    EXPO_PUBLIC_PAYKY_API_BASE_URL: process.env.EXPO_PUBLIC_PAYKY_API_BASE_URL,
    EXPO_PUBLIC_PAYKY_EET_PRODUCTION_URL:
      process.env.EXPO_PUBLIC_PAYKY_EET_PRODUCTION_URL,
    EXPO_PUBLIC_PAYKY_DONATE_LUD16_ADDRESS:
      process.env.EXPO_PUBLIC_PAYKY_DONATE_LUD16_ADDRESS,
    EXPO_PUBLIC_PAYKY_NOSTR_RELAYS: process.env.EXPO_PUBLIC_PAYKY_NOSTR_RELAYS,
    EXPO_PUBLIC_LINKY_RELAYS_URL: process.env.EXPO_PUBLIC_LINKY_RELAYS_URL,
    EXPO_PUBLIC_LINKY_EVOLU_RELAYS: process.env.EXPO_PUBLIC_LINKY_EVOLU_RELAYS,
    EXPO_PUBLIC_SENTRY_DSN: process.env.EXPO_PUBLIC_SENTRY_DSN,
  },
  emptyStringAsUndefined: true,
})

/** An absolute URL of `path` on the Payky API (native has no origin of its own). */
export const apiUrl = (path: string): string =>
  new URL(path, nativeEnv.EXPO_PUBLIC_PAYKY_API_BASE_URL).toString()
