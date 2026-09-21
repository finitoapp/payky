import { NonEmptyString100, NonEmptyString1000 } from "@linky/linksync"
import { Effect } from "effect"
import { nsecEncode } from "nostr-tools/nip19"
import { describe, expect, test } from "vitest"

import {
  deriveLinkyIdentity,
  resolveLinkyIdentity,
  shortenNpub,
} from "@/core/linky/linky-identity.ts"
import {
  createInMemoryLinkyStore,
  testLinkyMasterKey,
} from "@/core/linky/linky-store-test-fixtures.ts"

// The cross-app vector: Linky's own test pins these strings for the same share.
const derivedNsec =
  "nsec13lzw09lv9pd6zqtfxykleu8ny8hh0ux37r7qedcghz82m7mmwqjsaj430k"
const derivedNpub =
  "npub1emlla45qgkxa0n6yj243m0uygv6332atrxckg7z5c4226lg3ke2qxdfpgk"
// Any other valid key: the nsec of the all-ones secret.
const customNsec = nsecEncode(new Uint8Array(32).fill(1))

describe("Linky identity", () => {
  test("derives the nsec and npub Linky derives from the same share", () => {
    expect(deriveLinkyIdentity(testLinkyMasterKey)).toEqual({
      nsec: derivedNsec,
      npub: derivedNpub,
      pubkey: expect.stringMatching(/^[0-9a-f]{64}$/),
      source: "derived",
    })
  })

  test("falls back to the derived key while Linky has synced no identity row", async () => {
    await using linkyStore = await createInMemoryLinkyStore()
    const row = await Effect.runPromise(linkyStore.identity.current)

    expect(row).toBeNull()
    expect(resolveLinkyIdentity(row, testLinkyMasterKey).nsec).toBe(derivedNsec)
  })

  test("uses the nsec Linky synced when the user pasted a custom key there", async () => {
    await using linkyStore = await createInMemoryLinkyStore()
    await Effect.runPromise(
      linkyStore.identity.set({
        nsec: NonEmptyString1000.orThrow(customNsec),
        npub: null,
        source: NonEmptyString100.orThrow("custom"),
        switchedAtSec: null,
      })
    )
    const row = await Effect.runPromise(linkyStore.identity.current)

    const identity = resolveLinkyIdentity(row, testLinkyMasterKey)
    expect(identity.nsec).toBe(customNsec)
    expect(identity.source).toBe("custom")
    expect(identity.npub).not.toBe(derivedNpub)
  })

  test("ignores an identity row whose nsec does not decode", async () => {
    await using linkyStore = await createInMemoryLinkyStore()
    await Effect.runPromise(
      linkyStore.identity.set({
        nsec: NonEmptyString1000.orThrow("garbage"),
        npub: null,
        source: null,
        switchedAtSec: null,
      })
    )
    const row = await Effect.runPromise(linkyStore.identity.current)

    expect(resolveLinkyIdentity(row, testLinkyMasterKey).nsec).toBe(derivedNsec)
  })

  test("shortens an npub for labels", () => {
    expect(shortenNpub(derivedNpub)).toBe("npub1emlla45…xdfpgk")
  })
})
