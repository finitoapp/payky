import { getPublicKey } from "nostr-tools/pure"

import {
  deriveNostrSecretKey,
  deriveStationCommsSecretKey,
  type MasterKey,
} from "@/core/modules/shared/key-derivation.ts"
import { NostrPubkeyHex } from "@/core/modules/shared/schema.ts"

/** The key the owner talks to its stations under (station/0002). */
export const getStationCommsPubkey = (
  ownerMasterKey: MasterKey
): NostrPubkeyHex =>
  NostrPubkeyHex(getPublicKey(deriveStationCommsSecretKey(ownerMasterKey)))

/** A station's own Nostr key: NIP-06 account 0 of its master key. */
export const getStationNostrPubkey = (
  stationMasterKey: MasterKey
): NostrPubkeyHex =>
  NostrPubkeyHex(getPublicKey(deriveNostrSecretKey(stationMasterKey)))
