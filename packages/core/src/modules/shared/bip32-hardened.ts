import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js"

import { hmacSha512 } from "./hmac-sha512.ts"

/**
 * BIP32 private-key derivation for paths whose every level is hardened,
 * which is what Payky's BIP-85 paths are. A hardened child needs only the
 * parent's private key and chain code (HMAC-SHA512 and an addition modulo
 * the curve order), so this skips the secp256k1 public keys `HDKey.derive`
 * computes at every level. On Hermes those cost ~80 ms per derivation, and
 * the first one ~600 ms more while noble builds its point tables, which a
 * cold start paid several times over. The result is the same key: the test
 * compares it with `HDKey` byte for byte.
 */

const CURVE_ORDER =
  0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n
const HARDENED_OFFSET = 0x80000000
const MASTER_HMAC_KEY = new TextEncoder().encode("Bitcoin seed")

const toBigInt = (bytes: Uint8Array): bigint => BigInt(`0x${bytesToHex(bytes)}`)
const toBytes32 = (value: bigint): Uint8Array =>
  hexToBytes(value.toString(16).padStart(64, "0"))

/** `m/83696968'/39'/0'` as hardened child indexes, `null` unless every level is hardened. */
export const parseHardenedPath = (
  path: string
): ReadonlyArray<number> | null => {
  const [root, ...levels] = path.split("/")
  if (root !== "m") return null
  const indexes: number[] = []
  for (const level of levels) {
    const match = /^(\d+)'$/u.exec(level)
    if (match?.[1] === undefined) return null
    const index = Number(match[1])
    if (index >= HARDENED_OFFSET) return null
    indexes.push(index + HARDENED_OFFSET)
  }
  return indexes
}

/** The private key at hardened `indexes` below the master key of `seed`. */
export const deriveHardenedPrivateKey = (
  seed: Uint8Array,
  indexes: ReadonlyArray<number>
): Uint8Array => {
  const master = hmacSha512(MASTER_HMAC_KEY, seed)
  let key = toBigInt(master.slice(0, 32))
  let chainCode = master.slice(32)
  if (key === 0n || key >= CURVE_ORDER) {
    throw new Error("Invalid BIP32 master key.")
  }

  for (const index of indexes) {
    const data = new Uint8Array(37)
    data.set(toBytes32(key), 1)
    new DataView(data.buffer).setUint32(33, index)
    const child = hmacSha512(chainCode, data)
    const tweak = toBigInt(child.slice(0, 32))
    const childKey = (tweak + key) % CURVE_ORDER
    // HDKey refuses these too; at 2^-127 odds, a derivation that hits one fails.
    if (tweak >= CURVE_ORDER || childKey === 0n) {
      throw new Error("Invalid BIP32 child key.")
    }
    key = childKey
    chainCode = child.slice(32)
  }

  return toBytes32(key)
}
