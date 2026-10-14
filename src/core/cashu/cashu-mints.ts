import { err, ok, sqliteTrue, type Task } from "@evolu/common"
import { z } from "zod"

import type {
  CashuShardStore,
  CashuShardStoreDep,
} from "@/core/cashu/cashu-shard-store.ts"
import {
  type CashuWalletDep,
  loadCashuWallet,
  type MintFailure,
} from "@/core/cashu/cashu-wallet.ts"
import { defineError } from "@/core/error.ts"
import {
  addCashuMint,
  cashuDeviceKnownMintsQuery,
  removeCashuMint,
} from "@/core/evolu/device-cashu.ts"
import type {
  DeviceAccountId,
  DeviceEvolu,
} from "@/core/evolu/device-client.ts"
import {
  type MintUrl,
  MintUrl as toMintUrl,
} from "@/core/modules/cashu/cashu-types.ts"
import { normalizeMintUrl } from "@/core/modules/cashu/cashu-utils.ts"
import type { DeviceEvoluDep } from "@/core/modules/shared/evolu-deps.ts"
import { runMutationWithCompletion } from "@/core/modules/shared/evolu-utils.ts"

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

const createMintUrlInvalidError = defineError("CashuMintUrlInvalid")()
export type CashuMintUrlInvalidError = ReturnType<
  typeof createMintUrlInvalidError
>

const createMintInUseError = defineError("CashuMintInUse")<{
  readonly mint: MintUrl
}>()
export type CashuMintInUseError = ReturnType<typeof createMintInUseError>

/**
 * What the merchant typed as a mint URL, as Linky reads it (`MintNewPage`):
 * `https://` when no scheme is given, a dot in the host, then normalised.
 */
export const parseMintUrlInput = (text: string): MintUrl | null => {
  const trimmed = text.trim()
  if (trimmed === "") return null
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//iu.test(trimmed)
    ? trimmed
    : `https://${trimmed}`
  try {
    if (!new URL(withScheme).hostname.includes(".")) return null
  } catch {
    return null
  }
  return normalizeMintUrl(withScheme)
}

/**
 * Adds a mint by URL (cashu.md §7). Unlike Linky, a mint whose info and
 * keysets do not load is refused, and so is one listing another mint's
 * keyset; adding changes neither the default nor which tokens pay payments.
 */
export const addKnownCashuMint =
  (
    text: string
  ): Task<
    MintUrl,
    CashuMintUrlInvalidError | MintFailure,
    CashuWalletDep & CashuShardStoreDep & DeviceEvoluDep
  > =>
  async (run) => {
    const mint = parseMintUrlInput(text)
    if (mint === null) return err(createMintUrlInvalidError())
    const loaded = await run(loadCashuWallet(mint))
    if (!loaded.ok) return loaded
    await runMutationWithCompletion((options) =>
      addCashuMint(
        run.deps.deviceEvolu,
        run.deps.cashuWallet.deviceAccountId,
        mint,
        options
      )
    )
    return ok(mint)
  }

/**
 * Drops a mint from this device's added and seen mints (linkshu's
 * `removeKnownMint`): refused while a proof that is not spent, or a pending
 * `deferredReceive` Linky wrote, names it. A proof or operation naming it
 * later brings it back.
 */
export const removeKnownCashuMint =
  (
    mint: MintUrl
  ): Task<
    void,
    CashuMintInUseError,
    CashuWalletDep & CashuShardStoreDep & DeviceEvoluDep
  > =>
  async (run) => {
    const store = run.deps.cashuShardStore
    const [proofs, operations] = await Promise.all([
      store.loadProofs(),
      store.loadOperations(),
    ])
    const inUse =
      proofs.some((proof) => proof.mint === mint && proof.state !== "spent") ||
      operations.some(
        (operation) =>
          operation.kind === "deferredReceive" &&
          operation.status === "pending" &&
          operation.mint === mint
      )
    if (inUse) return err(createMintInUseError({ mint }))
    await runMutationWithCompletion((options) =>
      removeCashuMint(
        run.deps.deviceEvolu,
        run.deps.cashuWallet.deviceAccountId,
        mint,
        options
      )
    )
    return ok(undefined)
  }
