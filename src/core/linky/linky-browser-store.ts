import { createEvolu, SimpleName } from "@evolu-v7/common"
import { evoluWebDeps } from "@evolu-v7/web"
import { appOwnerFromMnemonic, LinkySchema } from "@linky/linksync"
import { createEvoluShardDb } from "@linky/linksync/evolu"
import { sha256 } from "@noble/hashes/sha2.js"
import { bytesToHex } from "@noble/hashes/utils.js"
import { z } from "zod"

import { linkyEnv } from "@/core/linky/linky-env.ts"
import {
  composeLinkyStore,
  type LinkyStoreHandle,
} from "@/core/linky/linky-store.ts"
import {
  deriveLinkyMetaOwnerMnemonic,
  type MasterKey,
} from "@/core/modules/shared/key-derivation.ts"

const RetainedFromSchema = z.number().int().nonnegative().nullable()

/**
 * Which shard index this device keeps history from, per scope — the
 * `ShardRetention` port. Device-local by design (Linky keeps it in
 * localStorage too), keyed by the Linky owner so two accounts on one device
 * never share it.
 */
const createLocalStorageRetention = (appOwnerId: string) => {
  const key = (scope: string) =>
    `payky.linky.shards.retainedFrom.${appOwnerId}.${scope}`

  return {
    get: (scope: string): number | undefined => {
      const raw = localStorage.getItem(key(scope))
      if (raw === null) return undefined
      try {
        return RetainedFromSchema.parse(JSON.parse(raw)) ?? undefined
      } catch {
        return undefined
      }
    },
    set: (scope: string, firstIndex: number): void => {
      localStorage.setItem(key(scope), JSON.stringify(firstIndex))
    },
  }
}

/**
 * Opens the Linky data of the account behind `masterKey` in this browser:
 * an Evolu 7 client (Linky's relay speaks Evolu 7, and its wire encoding
 * differs from the Evolu 8 Payky stores its own data with) owned by Linky's
 * "meta" owner, syncing with Linky's relays. The local database name is
 * Payky's own — only the owner and the relay decide what data this is.
 */
export const createBrowserLinkyStore = async (
  masterKey: MasterKey
): Promise<LinkyStoreHandle> => {
  const appOwner = appOwnerFromMnemonic(deriveLinkyMetaOwnerMnemonic(masterKey))
  if (appOwner === null) {
    throw new Error(
      "The derived Linky owner mnemonic is not a BIP-39 mnemonic."
    )
  }

  const ownerHash = bytesToHex(
    sha256(new TextEncoder().encode(appOwner.id))
  ).slice(0, 16)
  const evolu = createEvolu(evoluWebDeps)(LinkySchema, {
    name: SimpleName.orThrow(`payky-linky-${ownerHash}`),
    transports: linkyEnv.VITE_LINKY_EVOLU_SERVER_URLS.map((url) => ({
      type: "WebSocket" as const,
      url,
    })),
    externalAppOwner: appOwner,
  })

  // As Linky does: the store is built once the database worker has answered
  // a first query, so pointer reads see the local rows.
  await evolu.loadQuery(
    evolu.createQuery((db) =>
      db.selectFrom("shardPointer").select("id").limit(1)
    )
  )

  return composeLinkyStore({
    db: createEvoluShardDb(evolu),
    appOwner,
    retention: createLocalStorageRetention(appOwner.id),
    disposeDb: () => {
      evolu[Symbol.dispose]()
    },
  })
}
