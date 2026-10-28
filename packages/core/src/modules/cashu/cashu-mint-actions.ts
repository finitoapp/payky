import {
  err,
  type MutationOptions,
  ok,
  sqliteFalse,
  sqliteTrue,
  type Task,
} from "@evolu/common"
import {
  type CashuWalletDep,
  loadCashuWallet,
} from "../../cashu/cashu-wallet.ts"
import type { DateDep, EvoluOwnerDep } from "../../deps.ts"
import type { Evolu } from "../../evolu/schema.ts"
import type { EvoluDep } from "../shared/evolu-deps.ts"
import { runMutationWithCompletion } from "../shared/evolu-utils.ts"
import type { TimestampMs } from "../shared/schema.ts"
import {
  type CashuLastTrustedMintError,
  type CashuMintNotTrustedError,
  type CashuMintUrlInvalidError,
  createCashuLastTrustedMintError,
  createCashuMintNotTrustedError,
  createCashuMintUrlInvalidError,
  type MintFailure,
} from "./cashu-errors.ts"
import {
  cashuNewestDefaultedAtQuery,
  cashuTrustedMintsQuery,
} from "./cashu-queries.ts"
import type { MintUrl } from "./cashu-types.ts"
import {
  cashuMintIdFor,
  defaultCashuMintWithout,
  MAIN_MINT_URL,
  nextDefaultedAt,
  parseMintUrlInput,
  pickDefaultCashuMint,
  WEAKEST_DEFAULTED_AT,
} from "./cashu-utils.ts"

/*
 * The mints screen's writes. A `cashuMint` row is a trusted mint
 * (cashu/0017) and the newest `defaultedAt` among them the default
 * (cashu/0013); both live in the same row.
 */

/**
 * Trusts a mint by URL (cashu/0016). A mint whose info and keysets do not
 * load is refused, and so is one listing another mint's keyset. Trusting
 * does not change the default; trusting again keeps the old `defaultedAt`,
 * which a later choice always beats.
 */
export const trustCashuMint =
  (
    text: string
  ): Task<
    MintUrl,
    CashuMintUrlInvalidError | MintFailure,
    CashuWalletDep & EvoluDep & EvoluOwnerDep
  > =>
  async (run) => {
    const mint = parseMintUrlInput(text)
    if (mint === null) return err(createCashuMintUrlInvalidError())
    const loaded = await run(loadCashuWallet(mint))
    if (!loaded.ok) return loaded
    await runMutationWithCompletion((options) =>
      run.deps.evolu.upsert(
        "cashuMint",
        { id: cashuMintIdFor(mint), mintUrl: mint, isDeleted: sqliteFalse },
        { ...options, owner: run.deps.evoluOwner }
      )
    )
    return ok(mint)
  }

/**
 * Stops trusting a mint (cashu/0016): Payky no longer receives its tokens.
 * Its balance stays, to move or withdraw. Untrusting the default hands it to
 * the next newest choice, which this returns; the last trusted mint cannot
 * be untrusted. The hand-off is written as a choice in the same batch
 * (cashu/0013), so the successor is chosen on every device and later than
 * the untrusted mint's own `defaultedAt`, which trusting it again keeps.
 */
export const untrustCashuMint =
  (
    mint: MintUrl
  ): Task<
    MintUrl,
    CashuLastTrustedMintError,
    EvoluDep & EvoluOwnerDep & DateDep
  > =>
  async (run) => {
    const { evolu, evoluOwner } = run.deps
    const trusted = await evolu.loadQuery(cashuTrustedMintsQuery)
    const isTrusted =
      trusted.some((row) => row.mintUrl === mint) ||
      (trusted.length === 0 && mint === MAIN_MINT_URL)
    if (!isTrusted) return ok(pickDefaultCashuMint(trusted).mintUrl)
    const next = defaultCashuMintWithout(trusted, mint)
    if (next === null) return err(createCashuLastTrustedMintError({ mint }))
    const wasDefault = pickDefaultCashuMint(trusted).mintUrl === mint
    const defaultedAt = wasDefault ? await run.ok(loadNextDefaultedAt) : null
    await runMutationWithCompletion((options) => {
      const mutationOptions = { ...options, owner: evoluOwner }

      evolu.update(
        "cashuMint",
        { id: cashuMintIdFor(mint), isDeleted: sqliteTrue },
        mutationOptions
      )
      if (defaultedAt !== null)
        upsertDefaultCashuMint(evolu, next, defaultedAt, true, mutationOptions)
    })
    return ok(next)
  }

/**
 * Makes a trusted mint the default (cashu/0013): new payments are quoted
 * there and it leads the NUT-18 request. Moves no funds.
 */
export const setDefaultCashuMint =
  (
    mint: MintUrl
  ): Task<void, CashuMintNotTrustedError, EvoluDep & EvoluOwnerDep & DateDep> =>
  async (run) => {
    const trusted = await run.deps.evolu.loadQuery(cashuTrustedMintsQuery)
    const isTrusted =
      trusted.some((row) => row.mintUrl === mint) ||
      (trusted.length === 0 && mint === MAIN_MINT_URL)
    if (!isTrusted) return err(createCashuMintNotTrustedError({ mint }))
    await run.ok(writeDefaultCashuMint(mint, trusted))
    return ok(undefined)
  }

/**
 * The mint enabling Cashu seeds as the default (cashu/0013): `MAIN_MINT_URL`,
 * unless a trusted mint was chosen already, so enabling again keeps the
 * merchant's choice; null when none is due. Writes nothing: the caller folds
 * `upsertWeakDefaultCashuMint` into the batch that enables the account.
 */
export const loadCashuMintSeed: Task<MintUrl | null, never, EvoluDep> = async (
  run
) => {
  const trusted = await run.deps.evolu.loadQuery(cashuTrustedMintsQuery)
  return ok(
    trusted.some((row) => row.defaultedAt !== null) ? null : MAIN_MINT_URL
  )
}

/**
 * The default mint a payment is quoted at (cashu/0013). `chosen` is false
 * for a fallback nobody chose (Cashu enabled before the seed, every chosen
 * mint untrusted concurrently, or the mints not synced in yet): the caller
 * writes it with `upsertWeakDefaultCashuMint` in the payment's batch, so
 * every device quotes at the same one from then on.
 */
export const loadDefaultCashuMint: Task<
  { readonly mintUrl: MintUrl; readonly chosen: boolean },
  never,
  EvoluDep
> = async (run) =>
  ok(
    pickDefaultCashuMint(await run.deps.evolu.loadQuery(cashuTrustedMintsQuery))
  )

/**
 * Writes `mint` as a default Payky chose for the merchant, the seed or the
 * fallback, into the caller's batch (cashu/0013): at `WEAKEST_DEFAULTED_AT`,
 * below every real choice, and without `isDeleted`, so an untrust made
 * elsewhere keeps its cell.
 */
export const upsertWeakDefaultCashuMint = (
  evolu: Evolu,
  mint: MintUrl,
  options: MutationOptions
): void => {
  evolu.upsert(
    "cashuMint",
    {
      id: cashuMintIdFor(mint),
      mintUrl: mint,
      defaultedAt: WEAKEST_DEFAULTED_AT,
    },
    options
  )
}

/**
 * Chooses `mint`, later than every earlier choice. Only `defaultedAt` is
 * written for a mint already trusted, so an untrust made meanwhile on another
 * device keeps its own cell and wins (cashu/0013); a mint not trusted yet
 * (`MAIN_MINT_URL` with no trusted row) is trusted in the same write.
 */
const writeDefaultCashuMint =
  (
    mint: MintUrl,
    trusted: ReadonlyArray<{ readonly mintUrl: MintUrl }>
  ): Task<void, never, EvoluDep & EvoluOwnerDep & DateDep> =>
  async (run) => {
    const defaultedAt = await run.ok(loadNextDefaultedAt)
    const isTrusted = trusted.some((row) => row.mintUrl === mint)
    await runMutationWithCompletion((options) =>
      upsertDefaultCashuMint(run.deps.evolu, mint, defaultedAt, isTrusted, {
        ...options,
        owner: run.deps.evoluOwner,
      })
    )
    return ok(undefined)
  }

/** A `defaultedAt` later than every earlier choice (cashu/0013). */
const loadNextDefaultedAt: Task<
  TimestampMs,
  never,
  EvoluDep & DateDep
> = async (run) => {
  const { evolu, date } = run.deps
  const [newest] = await evolu.loadQuery(cashuNewestDefaultedAtQuery)
  return ok(nextDefaultedAt(date.now().getTime(), newest?.newest ?? null))
}

/** Writes the choice of `mint` into the caller's batch. */
const upsertDefaultCashuMint = (
  evolu: Evolu,
  mint: MintUrl,
  defaultedAt: TimestampMs,
  isTrusted: boolean,
  options: MutationOptions
): void => {
  evolu.upsert(
    "cashuMint",
    isTrusted
      ? { id: cashuMintIdFor(mint), mintUrl: mint, defaultedAt }
      : {
          id: cashuMintIdFor(mint),
          mintUrl: mint,
          isDeleted: sqliteFalse,
          defaultedAt,
        },
    options
  )
}
