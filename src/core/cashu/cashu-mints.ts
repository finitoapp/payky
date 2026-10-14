import { sqliteTrue } from "@evolu/common"
import { z } from "zod"

import type { CashuShardStore } from "@/core/cashu/cashu-shard-store.ts"
import { cashuDeviceKnownMintsQuery } from "@/core/evolu/device-cashu.ts"
import type {
  DeviceAccountId,
  DeviceEvolu,
} from "@/core/evolu/device-client.ts"
import {
  type MintUrl,
  MintUrl as toMintUrl,
} from "@/core/modules/cashu/cashu-types.ts"
import { normalizeMintUrl } from "@/core/modules/cashu/cashu-utils.ts"

/**
 * Linky's `knownMints`: the mints stored proofs name (any state), the mints
 * stored operations name (`mint` and `sourceMint`), and the mints this device
 * has seen or added. Being known says nothing about trust (cashu.md §5).
 */
export const loadKnownCashuMints = async ({
  store,
  deviceEvolu,
  deviceAccountId,
}: {
  readonly store: CashuShardStore
  readonly deviceEvolu: DeviceEvolu
  readonly deviceAccountId: DeviceAccountId
}): Promise<ReadonlyArray<MintUrl>> => {
  const [proofs, operations, deviceRows] = await Promise.all([
    store.loadProofs(),
    store.loadOperations(),
    deviceEvolu.loadQuery(cashuDeviceKnownMintsQuery(deviceAccountId)),
  ])
  const device = deviceRows.flatMap((row) => {
    if (row.seen !== sqliteTrue && row.added !== sqliteTrue) return []
    const mint = row.mint === null ? null : normalizeMintUrl(row.mint)
    return mint === null ? [] : [mint]
  })
  return [
    ...new Set([
      ...proofs.map((proof) => proof.mint),
      ...operations.flatMap((operation) =>
        operation.sourceMint === null
          ? [operation.mint]
          : [operation.mint, operation.sourceMint]
      ),
      ...device,
    ]),
  ].toSorted()
}

/** Linky's `MAIN_MINT_URL` default, the mint it suggests to new wallets. */
export const MAIN_MINT_URL = toMintUrl("https://cashu.cz")

/**
 * Linky's presets (`PRODUCTION_MINTS`), shown as suggestions on the mints
 * screen; Linky's test mint is left out on purpose (cashu.md §7).
 */
export const PRODUCTION_MINTS: ReadonlyArray<MintUrl> = [
  MAIN_MINT_URL,
  toMintUrl("https://mint.minibits.cash/Bitcoin"),
  toMintUrl("https://kashu.me"),
  toMintUrl("https://cashu.21m.lol"),
]

/** Linky's synced setting key, encoded with Linky's `Schema.NonEmptyString`. */
export const DEFAULT_MINT_SETTING_KEY = "defaultMint"

const DefaultMintSettingSchema = z.string().min(1)

/**
 * The mint new Cashu payments use (decision 5): Linky's synced `defaultMint`,
 * decoded as Linky decodes it, else Linky's default. Payky keeps no device
 * override; Linky's exists only so its UI works before sync.
 */
export const loadCashuDefaultMint = async (
  store: CashuShardStore
): Promise<MintUrl> => {
  const value = DefaultMintSettingSchema.safeParse(
    await store.readSetting(DEFAULT_MINT_SETTING_KEY)
  )
  return (value.success ? normalizeMintUrl(value.data) : null) ?? MAIN_MINT_URL
}

/** Sets the synced default mint Linky reads; a write of the same value is skipped. */
export const writeCashuDefaultMint = (
  store: CashuShardStore,
  mint: MintUrl
): Promise<void> => store.writeSetting(DEFAULT_MINT_SETTING_KEY, mint)

/**
 * Linky's `seedOnboardingDefaultMint`: a wallet without a `defaultMint` row
 * gets Linky's default, once.
 */
export const seedCashuDefaultMint = (store: CashuShardStore): Promise<void> =>
  store.writeSettingIfAbsent(DEFAULT_MINT_SETTING_KEY, MAIN_MINT_URL)
