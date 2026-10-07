import {
  Base64Url,
  base64UrlToUint8Array,
  err,
  ok,
  type Result,
  uint8ArrayToBase64Url,
} from "@evolu/common"
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js"

import { appEnv } from "@/core/app-env.ts"
import { defineError } from "@/core/error.ts"
import { MasterKey } from "@/core/modules/shared/key-derivation.ts"
import { NostrPubkeyHex } from "@/core/modules/shared/schema.ts"

export const createStationLinkInvalidError = defineError("StationLinkInvalid")<{
  readonly reason: "encoding" | "version" | "length"
}>()
export type StationLinkInvalidError = ReturnType<
  typeof createStationLinkInvalidError
>

const linkVersion = 1
const masterKeyLength = 16
const pubkeyLength = 32

/**
 * The link that opens a station on another device (station/0001):
 * `/pos#` and, base64url, a version byte, the station's 16 bytes of entropy
 * and the owner's 32-byte comms pubkey. The secret sits in the fragment, so
 * it never reaches a server.
 */
export const encodeStationLink = ({
  origin,
  masterKey,
  ownerPubkey,
}: {
  readonly origin: string
  readonly masterKey: MasterKey
  readonly ownerPubkey: NostrPubkeyHex
}): string => {
  const bytes = new Uint8Array([
    linkVersion,
    ...hexToBytes(masterKey),
    ...hexToBytes(ownerPubkey),
  ])
  return `${origin}/pos#${uint8ArrayToBase64Url(bytes)}`
}

/** The station's master key and its owner's pubkey, from a link fragment. */
export const decodeStationLinkFragment = (
  fragment: string
): Result<
  { readonly masterKey: MasterKey; readonly ownerPubkey: NostrPubkeyHex },
  StationLinkInvalidError
> => {
  const encoded = Base64Url.fromUnknown(fragment.replace(/^#/u, ""))
  if (!encoded.ok) {
    return err(createStationLinkInvalidError({ reason: "encoding" }))
  }

  const bytes = base64UrlToUint8Array(encoded.value)
  if (bytes[0] !== linkVersion) {
    return err(createStationLinkInvalidError({ reason: "version" }))
  }
  if (bytes.length !== 1 + masterKeyLength + pubkeyLength) {
    return err(createStationLinkInvalidError({ reason: "length" }))
  }

  return ok({
    masterKey: MasterKey(bytesToHex(bytes.slice(1, 1 + masterKeyLength))),
    ownerPubkey: NostrPubkeyHex(bytesToHex(bytes.slice(1 + masterKeyLength))),
  })
}

/**
 * Where a link points: the page's own origin in a browser, Payky's public
 * one in the native app, whose origin is `https://localhost`.
 */
export const resolveStationLinkOrigin = ({
  isNativePlatform,
  locationOrigin,
}: {
  readonly isNativePlatform: boolean
  readonly locationOrigin: string
}): string =>
  (isNativePlatform ? appEnv.VITE_PAYKY_API_BASE_URL : locationOrigin).replace(
    /\/$/u,
    ""
  )
