import { err, type MutationOptions, ok, type Task } from "@evolu/common"
import { z } from "zod"
import {
  type CashuWalletDep,
  loadCashuWallet,
} from "../../cashu/cashu-wallet.ts"
import type { AppOwnerSyncDep, EvoluOwnerDep } from "../../deps.ts"
import type { Evolu } from "../../evolu/schema.ts"
import type { EvoluDep } from "../shared/evolu-deps.ts"
import { runMutationWithCompletion } from "../shared/evolu-utils.ts"
import {
  type CashuLastTrustedMintError,
  type CashuMintNotTrustedError,
  type CashuMintsNotSyncedError,
  type CashuMintsStillSyncingError,
  type CashuMintUrlInvalidError,
  createCashuLastTrustedMintError,
  createCashuMintNotTrustedError,
  createCashuMintsNotSyncedError,
  createCashuMintsStillSyncingError,
  createCashuMintUrlInvalidError,
  type MintFailure,
} from "./cashu-errors.ts"
import { cashuTrustedMintsQuery } from "./cashu-queries.ts"
import type { MintUrl } from "./cashu-types.ts"
import {
  CashuTrustedMintsJson,
  cashuMintTrustId,
  hasNoCashuMintCells,
  MAIN_MINT_URL,
  parseMintUrlInput,
  pickDefaultCashuMint,
  trustedCashuMintsOf,
} from "./cashu-utils.ts"

/*
 * The mints screen's writes (cashu/0015, cashu/0013). The trusted mints are
 * one list in one cell, the default first: every write is the whole list as
 * this device sees it, changed, and never empty. A device that knows no
 * trusted mint has not synced them (cashu/0018): any list it wrote would
 * replace the merchant's, so it writes none.
 */

/** The trusted mints as this device knows them, the default first. */
const loadTrustedCashuMints: Task<
  ReadonlyArray<MintUrl>,
  never,
  EvoluDep
> = async (run) =>
  ok(
    trustedCashuMintsOf(await run.deps.evolu.loadQuery(cashuTrustedMintsQuery))
  )

/** Writes the whole list, the default first; never empty (cashu/0013). */
const upsertTrustedCashuMints = (
  evolu: Evolu,
  mints: readonly [MintUrl, ...ReadonlyArray<MintUrl>],
  options: MutationOptions
): void => {
  evolu.upsert(
    "cashuMintTrust",
    {
      id: cashuMintTrustId,
      trustedMintsJson: z.encode(CashuTrustedMintsJson, mints),
    },
    options
  )
}

/**
 * Trusts a mint by URL (cashu/0015): it joins the end of the list, so the
 * default does not change. A mint whose info and keysets do not load is
 * refused, and so is one listing another mint's keyset.
 */
export const trustCashuMint =
  (
    text: string
  ): Task<
    MintUrl,
    CashuMintUrlInvalidError | CashuMintsNotSyncedError | MintFailure,
    CashuWalletDep & EvoluDep & EvoluOwnerDep
  > =>
  async (run) => {
    const mint = parseMintUrlInput(text)
    if (mint === null) return err(createCashuMintUrlInvalidError())
    if ((await run.ok(loadTrustedCashuMints)).length === 0)
      return err(createCashuMintsNotSyncedError())
    // The mint as it is now, never a snapshot an earlier session kept.
    const loaded = await run(loadCashuWallet(mint, { keysets: "now" }))
    if (!loaded.ok) return loaded
    // Read again: the list may have synced in while the mint loaded.
    const [first, ...rest] = await run.ok(loadTrustedCashuMints)
    if (first === undefined) return err(createCashuMintsNotSyncedError())
    if (first === mint || rest.includes(mint)) return ok(mint)
    await runMutationWithCompletion((options) =>
      upsertTrustedCashuMints(run.deps.evolu, [first, ...rest, mint], {
        ...options,
        owner: run.deps.evoluOwner,
      })
    )
    return ok(mint)
  }

/**
 * Stops trusting a mint (cashu/0015): Payky no longer receives its tokens.
 * Its balance stays, to move or withdraw. Untrusting the default hands it to
 * the next in the list, the previous choice, which this returns; the last
 * trusted mint cannot be untrusted.
 */
export const untrustCashuMint =
  (
    mint: MintUrl
  ): Task<
    MintUrl,
    CashuLastTrustedMintError | CashuMintsNotSyncedError,
    EvoluDep & EvoluOwnerDep
  > =>
  async (run) => {
    const trusted = await run.ok(loadTrustedCashuMints)
    const current = pickDefaultCashuMint(trusted)
    if (current === null) return err(createCashuMintsNotSyncedError())
    if (!trusted.includes(mint)) return ok(current)
    const [next, ...rest] = trusted.filter(
      (trustedMint) => trustedMint !== mint
    )
    if (next === undefined)
      return err(createCashuLastTrustedMintError({ mint }))
    await runMutationWithCompletion((options) =>
      upsertTrustedCashuMints(run.deps.evolu, [next, ...rest], {
        ...options,
        owner: run.deps.evoluOwner,
      })
    )
    return ok(next)
  }

/**
 * Makes a trusted mint the default (cashu/0013): it moves to the front of
 * the list, so new payments are quoted there and it leads the NUT-18
 * request. Moves no funds.
 */
export const setDefaultCashuMint =
  (
    mint: MintUrl
  ): Task<
    void,
    CashuMintNotTrustedError | CashuMintsNotSyncedError,
    EvoluDep & EvoluOwnerDep
  > =>
  async (run) => {
    const trusted = await run.ok(loadTrustedCashuMints)
    if (trusted.length === 0) return err(createCashuMintsNotSyncedError())
    if (!trusted.includes(mint))
      return err(createCashuMintNotTrustedError({ mint }))
    if (trusted[0] === mint) return ok(undefined)
    await runMutationWithCompletion((options) =>
      upsertTrustedCashuMints(
        run.deps.evolu,
        [mint, ...trusted.filter((trustedMint) => trustedMint !== mint)],
        { ...options, owner: run.deps.evoluOwner }
      )
    )
    return ok(undefined)
  }

/**
 * The default mint a payment is quoted at (cashu/0013). With no trusted mint
 * at all the device has not synced the account's mints, and `MAIN_MINT_URL`
 * may be one the merchant untrusted, so nothing is quoted (cashu/0018).
 */
export const loadDefaultCashuMint: Task<
  MintUrl,
  CashuMintsNotSyncedError,
  EvoluDep
> = async (run) => {
  const picked = pickDefaultCashuMint(await run.ok(loadTrustedCashuMints))
  if (picked === null) return err(createCashuMintsNotSyncedError())
  return ok(picked)
}

/**
 * Whether an enabled Cashu account is due its seed (cashu/0013): no device
 * has written the mints, list or seed, as far as this device's rows show,
 * and it holds everything the relays hold. A list it cannot decode counts
 * as written: a seed would never count against it.
 * Before its sync completes, a list the merchant wrote elsewhere may still
 * be on its way, and a seed would quote payments at `MAIN_MINT_URL` until it
 * arrived. Writes nothing.
 */
export const loadCashuMintSeedDue: Task<
  boolean,
  never,
  EvoluDep & AppOwnerSyncDep
> = async (run) =>
  ok(
    run.deps.appOwnerSync.state().type === "complete" &&
      hasNoCashuMintCells(
        await run.deps.evolu.loadQuery(cashuTrustedMintsQuery)
      )
  )

/**
 * The seed of an enabled account that was not due it when it was enabled
 * (cashu/0013): the Cashu job writes it once this device has synced and
 * still knows no trusted mint. Whether it is due is read again each time,
 * so a restart in between loses nothing. True when it wrote the seed.
 */
export const seedCashuMintIfDue: Task<
  boolean,
  never,
  EvoluDep & EvoluOwnerDep & AppOwnerSyncDep
> = async (run) => {
  if (!(await run.ok(loadCashuMintSeedDue))) return ok(false)
  await runMutationWithCompletion((options) =>
    upsertCashuMintSeed(run.deps.evolu, {
      ...options,
      owner: run.deps.evoluOwner,
    })
  )
  return ok(true)
}

/**
 * The seed the merchant confirmed on a device whose sync is blocked
 * (cashu/0013): a relay that never completed a sync may hold a list this
 * device has not seen, and nothing will bring it while the relay is
 * unreachable. The seed is written all the same, in its own cell, so a list
 * that arrives later still wins over it. Refused while a relay is still on
 * its way; on a synced device it seeds as the Cashu job would, and a device
 * that knows a list writes nothing. True when it wrote the seed.
 */
export const seedCashuMintOnConfirm: Task<
  boolean,
  CashuMintsStillSyncingError,
  EvoluDep & EvoluOwnerDep & AppOwnerSyncDep
> = async (run) => {
  const sync = run.deps.appOwnerSync.state()
  if (sync.type === "pending") return err(createCashuMintsStillSyncingError())
  if (
    !hasNoCashuMintCells(await run.deps.evolu.loadQuery(cashuTrustedMintsQuery))
  )
    return ok(false)
  await runMutationWithCompletion((options) =>
    upsertCashuMintSeed(run.deps.evolu, {
      ...options,
      owner: run.deps.evoluOwner,
    })
  )
  return ok(true)
}

/**
 * The seed: trusts `MAIN_MINT_URL` in a cell of its own, read only while no
 * device has written the list. A list the merchant wrote on another device
 * before its row reached this one wins over it, whichever came later
 * (cashu/0013).
 */
export const upsertCashuMintSeed = (
  evolu: Evolu,
  options: MutationOptions
): void => {
  evolu.upsert(
    "cashuMintTrust",
    { id: cashuMintTrustId, seedMintUrl: MAIN_MINT_URL },
    options
  )
}
