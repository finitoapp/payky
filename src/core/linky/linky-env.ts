import { createEnv } from "@t3-oss/env-core"
import { z } from "zod"

const wsUrlList = (defaults: ReadonlyArray<string>) =>
  z
    .string()
    .transform((value) =>
      value
        .split(",")
        .map((url) => url.trim())
        .filter((url) => url.startsWith("ws://") || url.startsWith("wss://"))
    )
    .pipe(z.array(z.string()).min(1))
    .optional()
    .default([...defaults])

/**
 * Where the Linky store syncs and where the user's Nostr profile is read
 * from. The defaults are Linky's own: its Evolu relay first (with Evolu's
 * public relay as Linky also configures), and the Nostr relays Linky reads
 * by default plus its own. Overridable for a local Linky dev stack.
 */
export const linkyEnv = createEnv({
  clientPrefix: "VITE_",
  client: {
    VITE_LINKY_EVOLU_SERVER_URLS: wsUrlList([
      "wss://evolu.linky.fit",
      "wss://free.evoluhq.com",
    ]),
    VITE_LINKY_NOSTR_RELAYS: wsUrlList([
      "wss://relay.damus.io",
      "wss://nos.lol",
      "wss://relay.0xchat.com",
      "wss://nostr.linky.fit",
    ]),
  },
  runtimeEnv: import.meta.env,
  emptyStringAsUndefined: true,
})
