import { createRandomBytes, type OwnerSecret } from "@evolu/common"
import { hmac } from "@noble/hashes/hmac.js"
import { sha512 } from "@noble/hashes/sha2.js"
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js"
import { HDKey } from "@scure/bip32"
import {
  entropyToMnemonic,
  mnemonicToEntropy,
  mnemonicToSeedSync,
  validateMnemonic,
} from "@scure/bip39"
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

export const CashuMnemonicSchema = z
  .string()
  .refine(
    (value) =>
      validateMnemonic(value, wordlist) &&
      value.trim().split(/\s+/u).length === 24,
    {
      message: "Invalid 24-word BIP-39 mnemonic.",
    }
  )
  .brand<"CashuMnemonic">()
export type CashuMnemonic = z.output<typeof CashuMnemonicSchema>
export const CashuMnemonic = CashuMnemonicSchema.decode

/** The 64-byte BIP-39 seed a cashu wallet library derives its secrets from. */
export const CashuWalletSeedSchema = z
  .instanceof(Uint8Array)
  .refine((bytes) => bytes.length === 64, {
    message: "A cashu wallet seed is exactly 64 bytes.",
  })
  .brand<"CashuWalletSeed">()
export type CashuWalletSeed = z.output<typeof CashuWalletSeedSchema>
export const CashuWalletSeed = CashuWalletSeedSchema.decode

/** The 12-word BIP-39 mnemonic Linky names its Evolu app owner with. */
export const LinkyOwnerMnemonicSchema = z
  .string()
  .refine(
    (value) =>
      validateMnemonic(value, wordlist) &&
      value.trim().split(/\s+/u).length === 12,
    {
      message: "Invalid 12-word BIP-39 mnemonic.",
    }
  )
  .brand<"LinkyOwnerMnemonic">()
export type LinkyOwnerMnemonic = z.output<typeof LinkyOwnerMnemonicSchema>
export const LinkyOwnerMnemonic = LinkyOwnerMnemonicSchema.decode

/** A 32-byte secp256k1 private key, the Nostr signing key. */
export const NostrSigningKeySchema = z
  .instanceof(Uint8Array)
  .refine((bytes) => bytes.length === 32, {
    message: "A Nostr signing key is exactly 32 bytes.",
  })
  .brand<"NostrSigningKey">()
export type NostrSigningKey = z.output<typeof NostrSigningKeySchema>
export const NostrSigningKey = NostrSigningKeySchema.decode

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
/**
 * Shared with Linky: both apps derive the cashu wallet from this path, so one
 * SLIP-39 phrase opens the same ecash balance in either app. Pinned by the
 * `sharedCashuWallet` vector in `key-derivation-cross-app.test.ts`.
 */
export const defaultCashuDerivationPath = DerivationPath(
  "m/83696968'/39'/0'/24'/0'"
)
export const evoluOwnerDerivationPath = DerivationPath(
  "m/83696968'/39'/0'/24'/1'"
)
/**
 * Linky's Evolu app owner ("meta" owner, lane 0): a child of Payky's own
 * Evolu owner path, so the two apps never share a database by accident, yet
 * Payky can open Linky's data on purpose. Pinned by the `linkyMetaOwner`
 * vector in `key-derivation-cross-app.test.ts`.
 */
export const linkyMetaOwnerDerivationPath = DerivationPath(
  "m/83696968'/39'/0'/24'/1'/0'"
)
/** NIP-06: plain BIP-32, not BIP-85 — the node's private key is the key. */
export const nostrKeyDerivationPath = DerivationPath("m/44'/1237'/0'/0/0")
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

/**
 * Linky derives 16 bytes of BIP-85 entropy per owner and spells them as a
 * 12-word mnemonic; the mnemonic's entropy is the Evolu owner secret.
 */
export const deriveLinkyMetaOwnerMnemonic = (
  masterKey: MasterKey
): LinkyOwnerMnemonic =>
  LinkyOwnerMnemonic(
    entropyToMnemonic(
      deriveEntropy(masterKey, linkyMetaOwnerDerivationPath).slice(0, 16),
      wordlist
    )
  )

export const deriveNostrSigningKey = (
  masterKey: MasterKey
): NostrSigningKey => {
  const privateKey = HDKey.fromMasterSeed(hexToBytes(masterKey)).derive(
    nostrKeyDerivationPath
  ).privateKey

  if (privateKey === null) {
    throw new Error("The Nostr derivation path yielded no private key.")
  }

  return NostrSigningKey(new Uint8Array(privateKey))
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
 * The full 32 bytes of entropy become a 24-word BIP-39 mnemonic, the form
 * Linky shows as the cashu wallet backup and the one any BIP-39 cashu wallet
 * can import.
 */
export const deriveDefaultCashuWalletMnemonic = (
  masterKey: MasterKey
): CashuMnemonic =>
  CashuMnemonic(
    entropyToMnemonic(
      deriveEntropy(masterKey, defaultCashuDerivationPath),
      wordlist
    )
  )

/**
 * BIP-39 seed with an empty passphrase — the bytes the cashu wallet library
 * runs NUT-13 on. PBKDF2 work, so callers cache the result per account.
 */
export const cashuMnemonicToWalletSeed = (
  mnemonic: CashuMnemonic
): CashuWalletSeed => CashuWalletSeed(mnemonicToSeedSync(mnemonic))

/**
 * The Spark secret is used as BIP-39 entropy. The Spark SDK consumes the
 * resulting mnemonic (not the raw secret), so a wallet displayed as these 12
 * words can be restored in any BIP-39-compatible Spark client.
 */
export const sparkSecretToMnemonic = (secret: SparkSecret): SparkMnemonic =>
  SparkMnemonic(entropyToMnemonic(hexToBytes(secret), wordlist))

/**
 * The inverse, for importing the 12 words of a Spark wallet the user already
 * runs elsewhere (Wallet of Satoshi, Bitlifi, ...): the mnemonic's entropy is
 * exactly the 16-byte secret this app stores.
 */
export const sparkMnemonicToSecret = (mnemonic: SparkMnemonic): SparkSecret =>
  SparkSecret(
    bytesToHex(
      mnemonicToEntropy(mnemonic.trim().split(/\s+/u).join(" "), wordlist)
    )
  )
