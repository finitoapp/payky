import { hmac } from "@noble/hashes/hmac.js"
import { sha512 } from "@noble/hashes/sha2.js"

/** HMAC-SHA512, as a platform's native crypto offers it. */
export type HmacSha512 = (
  key: Uint8Array,
  data: Uint8Array
) => Uint8Array<ArrayBuffer>

let implementation: HmacSha512 = (key, data) => hmac(sha512, key, data)

/**
 * Runs Payky's own key derivations' HMAC-SHA512 (BIP32 hardened children,
 * SLIP-21 owner ids) on the platform's native crypto from now on. Noble's
 * pure-JS HMAC costs a few milliseconds each on Hermes, and the device
 * migration check derives every account on the device at every start;
 * browsers and Node keep noble's. Installed once at startup, as the native
 * polyfills are.
 */
export const installHmacSha512 = (native: HmacSha512): void => {
  implementation = native
}

export const hmacSha512: HmacSha512 = (key, data) => implementation(key, data)
