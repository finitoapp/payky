import type { AppOwner } from "@evolu-v7/common"
import {
  createLinkyStore,
  type IdentityRepository,
  type LinkyDbSchema,
  type LinkyStore,
  makeIdentityRepository,
  makeWalletRepository,
  type ShardDb,
  type ShardRetention,
  type WalletRepository,
} from "@linky/linksync"
import { Effect } from "effect"

/**
 * Linky's data for the active account, opened the way Linky opens it: the
 * `@linky/linksync` shard store over Linky's Evolu app owner, with the
 * repositories Payky reads through. Everything Payky shows about the Linky
 * account — the ecash inventory, the active Nostr identity — comes from
 * here, and every write goes through these repositories (never straight
 * to Evolu), so the two apps keep one state instead of two copies.
 */
export interface LinkyStoreHandle extends AsyncDisposable {
  readonly appOwnerId: string
  readonly store: LinkyStore
  /** linkshu's `ProofStore`/`OperationStore` over the cashu shards. */
  readonly wallet: WalletRepository
  /** The active Nostr identity row Linky keeps in the identity shard. */
  readonly identity: IdentityRepository
}

export const composeLinkyStore = async ({
  db,
  appOwner,
  retention,
  disposeDb,
}: {
  readonly db: ShardDb<LinkyDbSchema>
  readonly appOwner: AppOwner
  readonly retention?: ShardRetention
  readonly disposeDb?: () => void | Promise<void>
}): Promise<LinkyStoreHandle> => {
  const store = createLinkyStore(db, appOwner, retention ? { retention } : {})
  // Subscribes the app owner and every visible shard, then keeps the set in
  // step with rotations made here or on another device.
  await Effect.runPromise(store.reconcileSync())
  const stopFollowingPointers = store.followPointers(() => undefined)

  return {
    appOwnerId: appOwner.id,
    store,
    wallet: makeWalletRepository(store),
    identity: makeIdentityRepository(store),
    async [Symbol.asyncDispose]() {
      stopFollowingPointers()
      await disposeDb?.()
    },
  }
}
