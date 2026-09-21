import {
  type IdentityRepository,
  NonEmptyString100,
  NonEmptyString1000,
  PositiveInt,
} from "@linky/linksync"
import { Effect } from "effect"

import type { LinkyIdentity } from "@/core/linky/linky-identity.ts"
import { publishNostrProfile } from "@/core/linky/nostr-profile.ts"

/**
 * Makes `next` the account's Nostr key everywhere. With `profileMetadata`,
 * that profile is signed again with the new key first (so the name and
 * picture follow it, and a relay outage aborts before anything changed);
 * `null` keeps whatever profile the new key already publishes. Then the
 * synced identity row is written, which every device and app on this
 * recovery phrase adopts. A custom key records when it took over; a return
 * to the derived key clears that cutoff.
 */
export const switchLinkyIdentity = async ({
  identityRepository,
  next,
  relays,
  profileMetadata,
}: {
  readonly identityRepository: IdentityRepository
  readonly next: LinkyIdentity
  readonly relays: ReadonlyArray<string>
  readonly profileMetadata: Readonly<Record<string, unknown>> | null
}): Promise<void> => {
  if (profileMetadata !== null && Object.keys(profileMetadata).length > 0) {
    await publishNostrProfile({
      nsec: next.nsec,
      relays,
      metadata: profileMetadata,
    })
  }

  await Effect.runPromise(
    identityRepository.set({
      nsec: NonEmptyString1000.orThrow(next.nsec),
      npub: NonEmptyString1000.orThrow(next.npub),
      source: NonEmptyString100.orThrow(next.source),
      switchedAtSec:
        next.source === "custom"
          ? PositiveInt.orThrow(Math.ceil(Date.now() / 1000))
          : null,
    })
  )
}
