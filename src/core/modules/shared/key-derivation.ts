import { createRandomBytes, type OwnerSecret } from "@evolu/common"
import { hmac } from "@noble/hashes/hmac.js"
import { sha512 } from "@noble/hashes/sha2.js"
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js"
import { HDKey } from "@scure/bip32"
import { entropyToMnemonic, validateMnemonic } from "@scure/bip39"
import { wordlist } from "@scure/bip39/wordlists/english.js"
import { Slip39 } from "slip39-ts"
import { z } from "zod"

const Hex16Schema = z.string().regex(/^[0-9a-f]{32}$/u)

export const MasterKeySchema = Hex16Schema.brand<"MasterKey">()
export type MasterKey = z.output<typeof MasterKeySchema>
export const MasterKey = MasterKeySchema.decode

export const SparkSecretSchema = Hex16Schema.brand<"SparkSecret">()
export type SparkSecret = z.output<typeof SparkSecretSchema>
export const SparkSecret = SparkSecretSchema.decode

export const SparkMnemonicSchema = z
  .string()
  .refine(
    (value) =>
      validateMnemonic(value, wordlist) &&
      value.trim().split(/\s+/u).length === 12,
    {
      message: "Invalid 12-word BIP-39 mnemonic.",
    }
  )
  .brand<"SparkMnemonic">()
export type SparkMnemonic = z.output<typeof SparkMnemonicSchema>
export const SparkMnemonic = SparkMnemonicSchema.decode

export const DerivationPathSchema = z.string().brand<"DerivationPath">()
export type DerivationPath = z.output<typeof DerivationPathSchema>
export const DerivationPath = DerivationPathSchema.decode

export const RecoveryMnemonicSchema = z
  .string()
  .refine(
    (value) =>
      Slip39.validateMnemonic(value) &&
      value.trim().split(/\s+/u).length === 20,
    {
      message: "Invalid 20-word SLIP-39 recovery mnemonic.",
    }
  )
  .brand<"RecoveryMnemonic">()
export type RecoveryMnemonic = z.output<typeof RecoveryMnemonicSchema>
export const RecoveryMnemonic = RecoveryMnemonicSchema.decode

/**
 * BIP-85 paths with the BIP-39 application:
 * `m/83696968'/39'/{language}'/{words}'/{index}'`, language `0'` = English.
 * The word count matches how much of the derived entropy each consumer uses:
 * 24 words = 32 bytes, 12 words = 16 bytes.
 */
export const evoluOwnerDerivationPath = DerivationPath(
  "m/83696968'/39'/0'/24'/0'"
)
export const defaultSparkWalletDerivationPath = DerivationPath(
  "m/83696968'/39'/0'/12'/0'"
)

const bipEntropyHmacKey = new TextEncoder().encode("bip-entropy-from-k")

const deriveEntropy = (
  masterKey: MasterKey,
  path: DerivationPath
): Uint8Array => {
  const privateKey = HDKey.fromMasterSeed(hexToBytes(masterKey)).derive(
    path
  ).privateKey

  if (privateKey === null) {
    throw new Error("A private BIP32 derivation path is required.")
  }

  return hmac(sha512, bipEntropyHmacKey, privateKey).slice(0, 32)
}

export const createMasterKey = (): MasterKey =>
  MasterKey(bytesToHex(createRandomBytes().create(16)))

/**
 * SLIP-39's identifier is a 15-bit value spread over 2 bytes: the high bit of
 * the first byte must be zero (`slip39-ts`'s internal, unexported
 * `generateIdentifier` masks it the same way via its private
 * `ID_BITS_LENGTH = 15` constant). This mask must stay in sync with that
 * constant if the library ever changes it.
 */
const SLIP39_IDENTIFIER_HIGH_BYTE_MASK = 0x7f

const slip39IdentifierHmacKey = new TextEncoder().encode(
  "payky-slip39-identifier"
)

/**
 * SLIP-39's identifier is embedded metadata, not secret key material, but
 * leaving it to the library's default (random) generator would make
 * `masterKeyToMnemonic` produce different words on every call for the same
 * master key. Deriving it deterministically (straight from the master key —
 * as metadata it doesn't warrant a BIP-85 derivation path) keeps the
 * displayed recovery phrase stable across renders.
 */
const deriveRecoveryMnemonicIdentifier = (masterKey: MasterKey): number[] => {
  const [firstByte, secondByte] = hmac(
    sha512,
    slip39IdentifierHmacKey,
    hexToBytes(masterKey)
  )
  return [(firstByte ?? 0) & SLIP39_IDENTIFIER_HIGH_BYTE_MASK, secondByte ?? 0]
}

export const masterKeyToMnemonic = async (
  masterKey: MasterKey
): Promise<RecoveryMnemonic> => {
  const slip = await Slip39.fromArray(Array.from(hexToBytes(masterKey)), {
    identifier: deriveRecoveryMnemonicIdentifier(masterKey),
  })
  const [mnemonic] = slip.fromPath("r/0").mnemonics

  if (mnemonic === undefined) {
    throw new Error("SLIP-39 encoding did not produce a recovery mnemonic.")
  }

  return RecoveryMnemonic(mnemonic)
}

export const mnemonicToMasterKey = async (
  mnemonic: RecoveryMnemonic
): Promise<MasterKey> => {
  const secret = await Slip39.recoverSecret([mnemonic])
  return MasterKey(bytesToHex(new Uint8Array(secret)))
}

export const deriveEvoluOwnerSecret = (masterKey: MasterKey): OwnerSecret =>
  deriveEntropy(masterKey, evoluOwnerDerivationPath) as OwnerSecret

export const deriveDefaultSparkWalletSecret = (
  masterKey: MasterKey
): SparkSecret =>
  SparkSecret(
    bytesToHex(
      deriveEntropy(masterKey, defaultSparkWalletDerivationPath).slice(0, 16)
    )
  )

/**
 * The Spark secret is used as BIP-39 entropy. The Spark SDK consumes the
 * resulting mnemonic (not the raw secret), so a wallet displayed as these 12
 * words can be restored in any BIP-39-compatible Spark client.
 */
export const sparkSecretToMnemonic = (secret: SparkSecret): SparkMnemonic =>
  SparkMnemonic(entropyToMnemonic(hexToBytes(secret), wordlist))
