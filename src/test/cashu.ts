import { testCreateLockManager } from "@evolu/common"

import { createCashuShardStore } from "@/core/cashu/cashu-shard-store.ts"
import { createCashuWalletDep } from "@/core/cashu/cashu-wallet.ts"
import {
  createFakeCashuMint,
  createFakeMintsFetch,
  type FakeCashuMintOptions,
} from "@/core/cashu/fake-cashu-mint.ts"
import { deriveLinkyAppOwner } from "@/core/cashu/linky-owners.ts"
import { deriveDeviceAccountId } from "@/core/evolu/device-account.ts"
import { MintUrl } from "@/core/modules/cashu/cashu-types.ts"
import {
  deriveCashuWalletSeed,
  MasterKey,
} from "@/core/modules/shared/key-derivation.ts"
import { createTestDeviceEvolu } from "@/test/device-evolu.ts"
import { createEvoluTest } from "@/test/evolu.ts"

export const testCashuMasterKey = MasterKey("000102030405060708090a0b0c0d0e0f")
export const testMintUrl = MintUrl("https://mint.test")

/**
 * The shared Cashu wallet for a test: an app Evolu with the Linky shard store
 * (hydrated, syncing nowhere), a device database, fake mints behind `fetch`,
 * and the deps every Cashu Task takes. `extraMints` adds more fake mints.
 */
export const createCashuTest = async ({
  mint: mintOptions = {},
  extraMints = [],
  now,
  fetch: realFetch,
}: {
  readonly mint?: Partial<FakeCashuMintOptions>
  readonly extraMints?: ReadonlyArray<FakeCashuMintOptions>
  readonly now?: () => number
  /** A real `fetch` instead of the fake mints, for the live test. */
  readonly fetch?: typeof globalThis.fetch
} = {}) => {
  await using disposer = new AsyncDisposableStack()
  const appEvolu = disposer.use(await createEvoluTest())
  const device = disposer.use(await createTestDeviceEvolu())
  // A melt at any fake mint pays the invoice wherever it was issued.
  const payInvoice = (invoice: string) => {
    for (const fake of [mint, ...others]) fake.payInvoice(invoice)
  }
  const mint = createFakeCashuMint({
    url: testMintUrl,
    onInvoicePaid: payInvoice,
    ...(now === undefined ? {} : { now }),
    ...mintOptions,
  })
  const others = extraMints.map((options) =>
    createFakeCashuMint({ onInvoicePaid: payInvoice, ...options })
  )
  const fetch = realFetch ?? createFakeMintsFetch([mint, ...others])
  const cashuShardStore = disposer.use(
    createCashuShardStore({
      evolu: appEvolu.evolu,
      linkyAppOwner: deriveLinkyAppOwner(testCashuMasterKey),
      ownerSync: { isOwnerSynced: () => true, subscribe: () => () => {} },
      relays: ["wss://evolu.linky.fit"],
      registerOwner: () => () => {},
      ...(now === undefined ? {} : { now }),
    })
  )
  const seed = deriveCashuWalletSeed(testCashuMasterKey)
  const deviceAccountId = deriveDeviceAccountId(testCashuMasterKey)
  const deps = {
    evolu: appEvolu.evolu,
    evoluOwnerId: appEvolu.evolu.appOwner.id,
    deviceEvolu: device.deviceEvolu,
    cashuShardStore,
    lockManager: testCreateLockManager(),
    fetch,
    ...createCashuWalletDep({ seed, deviceAccountId, fetch }),
  }
  /** Linky on another device: the same seed, its own wallet cache and counters. */
  const linkyWallet = createCashuWalletDep({ seed, deviceAccountId, fetch })
  const disposables = disposer.move()
  return {
    deps,
    mint,
    others,
    linkyWallet,
    [Symbol.asyncDispose]: () => disposables.disposeAsync(),
  }
}
