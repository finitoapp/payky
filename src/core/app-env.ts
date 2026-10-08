import { createEnv } from "@t3-oss/env-core"
import { z } from "zod"

export const appEnv = createEnv({
  clientPrefix: "VITE_",
  client: {
    // Absolute, because the native app's origin is https://localhost and has
    // no /api of its own to resolve a relative path against.
    VITE_PAYKY_API_BASE_URL: z.url().default("https://payky.me"),
    VITE_PAYKY_EET_PRODUCTION_URL: z.url().optional(),
    // REGTEST runs the app against Spark's test network with faucet sats.
    VITE_PAYKY_SPARK_NETWORK: z.enum(["MAINNET", "REGTEST"]).default("MAINNET"),
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
  },
  runtimeEnv: import.meta.env,
  emptyStringAsUndefined: true,
})
