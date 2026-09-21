import {
  appOwnerFromMnemonic,
  linkyTableColumns,
  makeInMemoryShardDb,
} from "@linky/linksync"

import {
  composeLinkyStore,
  type LinkyStoreHandle,
} from "@/core/linky/linky-store.ts"
import {
  deriveLinkyMetaOwnerMnemonic,
  MasterKey,
} from "@/core/modules/shared/key-derivation.ts"

/** The cross-app test vector's master key; its owners are pinned in tests. */
export const testLinkyMasterKey = MasterKey("000102030405060708090a0b0c0d0e0f")

/**
 * A Linky store over linksync's in-memory shard database: the same store,
 * repositories and shard rules as production, without Evolu or a relay.
 */
export const createInMemoryLinkyStore = async (
  masterKey = testLinkyMasterKey
): Promise<LinkyStoreHandle> => {
  const appOwner = appOwnerFromMnemonic(deriveLinkyMetaOwnerMnemonic(masterKey))
  if (appOwner === null) throw new Error("test master key yields no owner")

  return composeLinkyStore({
    db: makeInMemoryShardDb(linkyTableColumns),
    appOwner,
  })
}
