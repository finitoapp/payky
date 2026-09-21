import type { NostrIdentityRow } from "@linky/linksync"
import { bytesToHex } from "@noble/hashes/utils.js"
import { decode, npubEncode, nsecEncode } from "nostr-tools/nip19"
import { getPublicKey } from "nostr-tools/pure"

import {
  deriveNostrSigningKey,
  type MasterKey,
} from "@/core/modules/shared/key-derivation.ts"

export type LinkyIdentitySource = "derived" | "custom"

/** The Nostr identity Linky is using for this account. */
export interface LinkyIdentity {
  readonly nsec: string
  readonly npub: string
  /** Hex public key, what relays are queried by. */
  readonly pubkey: string
  /**
   * `derived`: the key NIP-06 derives from the recovery phrase. `custom`: an
   * nsec the user pasted into Linky, which Linky synced to every device.
   */
  readonly source: LinkyIdentitySource
}

const identityFromSecretKey = (
  secretKey: Uint8Array,
  source: LinkyIdentitySource
): LinkyIdentity => {
  const pubkey = getPublicKey(secretKey)
  return {
    nsec: nsecEncode(secretKey),
    npub: npubEncode(pubkey),
    pubkey,
    source,
  }
}

export const deriveLinkyIdentity = (masterKey: MasterKey): LinkyIdentity =>
  identityFromSecretKey(deriveNostrSigningKey(masterKey), "derived")

const secretKeyFromNsec = (nsec: string): Uint8Array | null => {
  try {
    const decoded = decode(nsec.trim())
    return decoded.type === "nsec" ? decoded.data : null
  } catch {
    return null
  }
}

/** The identity a pasted `nsec` names, or `null` when it does not decode. */
export const identityFromNsec = (
  nsec: string,
  source: LinkyIdentitySource
): LinkyIdentity | null => {
  const secretKey = secretKeyFromNsec(nsec)
  return secretKey === null ? null : identityFromSecretKey(secretKey, source)
}

/**
 * The identity row wins when Linky wrote one — that is how a pasted nsec
 * reaches other devices — and the derived key is the answer otherwise, the
 * same order Linky resolves it in. A row whose nsec does not decode is
 * ignored rather than trusted.
 */
export const resolveLinkyIdentity = (
  row: NostrIdentityRow | null,
  masterKey: MasterKey
): LinkyIdentity => {
  const rowSecretKey =
    row === null || row.nsec === null ? null : secretKeyFromNsec(row.nsec)
  if (rowSecretKey === null) return deriveLinkyIdentity(masterKey)

  // The first synced custom-identity rows predate the `source` column, so
  // a missing value means custom — Linky reads it the same way.
  const source: LinkyIdentitySource =
    row?.source?.trim() === "derived" ? "derived" : "custom"
  const identity = identityFromSecretKey(rowSecretKey, source)
  const derivedKey = deriveNostrSigningKey(masterKey)

  return bytesToHex(rowSecretKey) === bytesToHex(derivedKey)
    ? { ...identity, source: "derived" }
    : identity
}

/** `npub1abcd…wxyz` for labels; the full npub stays in the copy action. */
export const shortenNpub = (npub: string): string =>
  npub.length <= 20 ? npub : `${npub.slice(0, 12)}…${npub.slice(-6)}`
