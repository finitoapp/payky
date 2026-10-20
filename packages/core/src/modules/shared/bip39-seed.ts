import { mnemonicToSeedSync } from "@scure/bip39"

/** PBKDF2-HMAC-SHA512, as a platform's native crypto offers it. */
export type Pbkdf2Sha512 = (
  password: Uint8Array,
  salt: Uint8Array,
  iterations: number,
  keyLength: number
) => Uint8Array<ArrayBuffer>

const encoder = new TextEncoder()

/**
 * BIP-39's seed with an empty passphrase over `pbkdf2`: 2048 rounds of
 * PBKDF2-HMAC-SHA512 over the NFKD mnemonic, salted with "mnemonic", 64
 * bytes. The same function as `@scure/bip39`'s `mnemonicToSeedSync`.
 */
export const createBip39Seed =
  (pbkdf2: Pbkdf2Sha512) =>
  (mnemonic: string): Uint8Array<ArrayBuffer> =>
    pbkdf2(
      encoder.encode(mnemonic.normalize("NFKD")),
      encoder.encode("mnemonic"),
      2048,
      64
    )

let bip39Seed: (mnemonic: string) => Uint8Array<ArrayBuffer> = (mnemonic) =>
  mnemonicToSeedSync(mnemonic)

/**
 * Runs BIP-39 seeds on the platform's native PBKDF2 from now on. In pure JS
 * on Hermes one seed takes ~1.6 s of a blocked JS thread, and a native start
 * computes two (the Cashu wallet seed and the Spark wallet's); browsers and
 * Node keep `@scure/bip39`, which is fast enough there. Installed once at
 * startup, as the native polyfills are.
 */
export const installBip39Pbkdf2 = (pbkdf2: Pbkdf2Sha512): void => {
  bip39Seed = createBip39Seed(pbkdf2)
}

/** The BIP-39 seed of `mnemonic` with an empty passphrase. */
export const mnemonicToBip39Seed = (
  mnemonic: string
): Uint8Array<ArrayBuffer> => bip39Seed(mnemonic)
