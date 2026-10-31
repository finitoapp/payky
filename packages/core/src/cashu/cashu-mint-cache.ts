import type { GetInfoResponse, KeyChainCache } from "@cashu/cashu-ts"
import { z } from "zod"
import type { Evolu } from "../evolu/schema.ts"
import { cashuMintCacheQuery } from "../modules/cashu/cashu-queries.ts"
import type { MintUrl } from "../modules/cashu/cashu-types.ts"
import { cashuMintCacheIdFor } from "../modules/cashu/cashu-utils.ts"
import { jsonCodec } from "../zod-utils.ts"
import type { CashuMintCache } from "./cashu-wallet.ts"

// cashu-ts reads both back itself (`loadMintFromCache`) and throws on what it
// cannot use; only the outline is checked here.
const InfoJson = jsonCodec(
  z.custom<GetInfoResponse>(
    (value) => typeof value === "object" && value !== null
  )
)
const KeychainJson = jsonCodec(
  z.custom<KeyChainCache>(
    (value) =>
      typeof value === "object" &&
      value !== null &&
      "keysets" in value &&
      Array.isArray(value.keysets)
  )
)

/**
 * The mints' info and keysets in `_cashuMintCache`, local to this device, for
 * `createCashuWalletDep`: the `CashuMintCache` dep, not a domain action. It
 * writes behind the wallet, outside any run, as the device database's
 * writes do; a lost write only costs a later session one load from the
 * mint. A row that will not decode reads as none, and a write that changes
 * nothing is skipped.
 */
export const createCashuMintCache = (evolu: Evolu): CashuMintCache => {
  /** What this device last read or wrote, per mint, as stored. */
  const stored = new Map<
    MintUrl,
    { readonly infoJson: string; readonly keychainJson: string }
  >()
  return {
    read: async (mint) => {
      const [row] = await evolu.loadQuery(cashuMintCacheQuery(mint))
      if (
        row === undefined ||
        row.infoJson === null ||
        row.keychainJson === null
      )
        return null
      const info = z.safeDecode(InfoJson, row.infoJson)
      const keychain = z.safeDecode(KeychainJson, row.keychainJson)
      if (!info.success || !keychain.success) return null
      stored.set(mint, {
        infoJson: row.infoJson,
        keychainJson: row.keychainJson,
      })
      return { info: info.data, keychain: keychain.data }
    },
    write: (mint, { info, keychain }) => {
      const infoJson = z.encode(InfoJson, info)
      const keychainJson = z.encode(KeychainJson, keychain)
      const last = stored.get(mint)
      if (last?.infoJson === infoJson && last.keychainJson === keychainJson)
        return
      // Noted only once written: a write that throws, as on an app database
      // closed by an account switch, leaves the same one to the next try.
      evolu.upsert("_cashuMintCache", {
        id: cashuMintCacheIdFor(mint),
        mintUrl: mint,
        infoJson,
        keychainJson,
      })
      stored.set(mint, { infoJson, keychainJson })
    },
  }
}
