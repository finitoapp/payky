import type {
  AmountLike,
  JSONIntApi,
  ProofState,
  RequestFn,
  Wallet,
} from "@cashu/cashu-ts"
import {
  err,
  type LockManagerDep,
  ok,
  type Result,
  type Task,
} from "@evolu/common"
import type { DateDep, EvoluOwnerDep, FetchDep, MasterKeyDep } from "../deps.ts"
import {
  createMintRejectedError,
  createMintUnreachableError,
  type MintFailure,
} from "../modules/cashu/cashu-errors.ts"
import { cashuProofsOfKeysetsQuery } from "../modules/cashu/cashu-queries.ts"
import {
  type KeysetId,
  KeysetIdSchema,
  type MintUrl,
} from "../modules/cashu/cashu-types.ts"
import type { EvoluDep } from "../modules/shared/evolu-deps.ts"
import type { CashuWalletSeed } from "../modules/shared/key-derivation.ts"

/**
 * The cashu-ts wallet behind Payky's Cashu wallet, the counterpart of
 * `SparkWalletDep` (cashu/0012). Other code never constructs a cashu-ts
 * `Wallet` itself: it goes through `loadCashuWallet`, which loads each mint
 * once, refuses a mint listing another mint's keyset, and talks to the mint
 * over `FetchDep`, so tests, the demo and e2e put a fake mint behind it.
 *
 * cashu-ts is imported lazily, as the Spark SDK is, so it stays out of the
 * app's first chunk.
 */

interface CashuTs {
  readonly Mint: typeof import("@cashu/cashu-ts").Mint
  readonly Wallet: typeof import("@cashu/cashu-ts").Wallet
  readonly JSONInt: JSONIntApi
  readonly MintOperationError: typeof import("@cashu/cashu-ts").MintOperationError
  readonly HttpResponseError: typeof import("@cashu/cashu-ts").HttpResponseError
  readonly NetworkError: typeof import("@cashu/cashu-ts").NetworkError
}

const loadCashuTs = async (): Promise<CashuTs> => import("@cashu/cashu-ts")

/**
 * cashu-ts's own request over an injected `fetch`, raising the error classes
 * cashu-ts raises, so its wallet reacts to a mint behind `FetchDep` exactly as
 * to one it fetched itself.
 */
const createMintRequest = (
  cashu: CashuTs,
  fetch: FetchDep["fetch"]
): RequestFn =>
  (async ({ endpoint, requestBody, headers, method, signal }) => {
    const body =
      requestBody === undefined
        ? undefined
        : cashu.JSONInt.stringify(requestBody)
    let response: Response
    try {
      response = await fetch(endpoint, {
        method: method ?? (body === undefined ? "GET" : "POST"),
        body,
        headers: {
          Accept: "application/json, text/plain, */*",
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
          ...headers,
        },
        ...(signal === undefined || signal === null ? {} : { signal }),
      })
    } catch (error) {
      throw new cashu.NetworkError(
        error instanceof Error ? error.message : "Network request failed",
        { cause: error }
      )
    }
    const text = await response.text()
    if (!response.ok) {
      const parsed = (() => {
        try {
          return cashu.JSONInt.parse(text) as Record<string, unknown>
        } catch {
          return { detail: text }
        }
      })()
      if (
        response.status === 400 &&
        typeof parsed.code === "number" &&
        typeof parsed.detail === "string"
      )
        throw new cashu.MintOperationError(parsed.code, parsed.detail)
      throw new cashu.HttpResponseError(
        typeof parsed.detail === "string"
          ? parsed.detail
          : typeof parsed.error === "string"
            ? parsed.error
            : "HTTP request failed",
        response.status
      )
    }
    if (text === "")
      throw new cashu.HttpResponseError("bad response", response.status)
    return cashu.JSONInt.parse(text)
  }) as RequestFn

export interface CashuWalletDep {
  readonly cashuWallet: {
    readonly seed: CashuWalletSeed
    /** A loaded wallet for `mint|sat`, cached; a failed load is not. */
    readonly load: (mint: MintUrl) => Promise<Wallet>
    /** One load past the cache, for showing a mint's info; never derives outputs. */
    readonly loadFresh: (mint: MintUrl) => Promise<Wallet>
  }
}

export const createCashuWalletDep = ({
  seed,
  fetch,
}: {
  readonly seed: CashuWalletSeed
  readonly fetch: FetchDep["fetch"]
}): CashuWalletDep => {
  const loaded = new Map<string, Promise<Wallet>>()

  const loadWallet = async (mint: MintUrl): Promise<Wallet> => {
    const cashu = await loadCashuTs()
    const wallet = new cashu.Wallet(
      new cashu.Mint(mint, { customRequest: createMintRequest(cashu, fetch) }),
      { unit: "sat", bip39seed: seed }
    )
    await wallet.loadMint()
    return wallet
  }

  return {
    cashuWallet: {
      seed,
      load: (mint) => {
        const key = `${mint}|sat`
        const cached = loaded.get(key)
        if (cached !== undefined) return cached
        const loading = loadWallet(mint)
        loaded.set(key, loading)
        loading.catch(() => {
          if (loaded.get(key) === loading) loaded.delete(key)
        })
        return loading
      },
      loadFresh: loadWallet,
    },
  }
}

/**
 * A cashu-ts amount as a number. Its `Amount` is converted explicitly:
 * cashu-ts deprecates `Number(amount)` and throws on it from v5.
 */
export const amountToNumber = (value: AmountLike): number =>
  typeof value === "object" ? value.toNumber() : Number(value)

const errorText = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

/** The NUT error code of a mint's answer, when it gave one. */
export const mintErrorCode = (error: unknown): number | null =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  typeof error.code === "number"
    ? error.code
    : null

/**
 * A network-shaped failure or a 5xx is `MintUnreachable`, anything else a
 * definitive `MintRejected`.
 */
export const classifyMintError = (
  mint: MintUrl,
  error: unknown
): MintFailure => {
  const detail = errorText(error)
  const code = mintErrorCode(error)
  if (code !== null) return createMintRejectedError({ mint, code, detail })
  const status =
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    typeof error.status === "number"
      ? error.status
      : null
  if (status !== null)
    return status >= 500
      ? createMintUnreachableError({ mint, detail })
      : createMintRejectedError({ mint, code: null, detail })
  const name = error instanceof Error ? error.name : ""
  if (
    error instanceof TypeError ||
    name === "NetworkError" ||
    name === "AbortError" ||
    name === "TimeoutError"
  )
    return createMintUnreachableError({ mint, detail })
  return createMintRejectedError({ mint, code: null, detail })
}

/** A mint call as a `Result`, classified. */
export const callMint = async <T>(
  mint: MintUrl,
  call: () => Promise<T>
): Promise<Result<T, MintFailure>> => {
  try {
    return ok(await call())
  } catch (error) {
    return err(classifyMintError(mint, error))
  }
}

/**
 * NUT-13 derives secrets from the seed, keyset id and counter but not the
 * mint, so a mint listing another mint's keyset would re-derive proofs the
 * wallet already holds there. A keyset belongs to the mint of its oldest
 * stored proof; `proofs` come oldest first.
 */
export const foreignKeysetOwner = (
  mint: MintUrl,
  proofs: ReadonlyArray<{
    readonly mintUrl: MintUrl
    readonly keysetId: string
  }>
): MintUrl | null => {
  const owners = new Map<string, MintUrl>()
  for (const proof of proofs)
    if (!owners.has(proof.keysetId)) owners.set(proof.keysetId, proof.mintUrl)
  return [...owners.values()].find((owner) => owner !== mint) ?? null
}

export interface LoadedCashuWallet {
  readonly mint: MintUrl
  readonly wallet: Wallet
  /** The keyset new outputs derive from (the wallet's bound one). */
  readonly keysetId: KeysetId
  readonly supports: (nut: 7 | 17 | 20) => boolean
}

/**
 * Loads the mint and refuses it when it lists a keyset another mint owns,
 * checked on every load: proofs synced since may now own a keyset.
 */
export const loadCashuWallet =
  (
    mint: MintUrl
  ): Task<LoadedCashuWallet, MintFailure, CashuWalletDep & EvoluDep> =>
  async (run) => {
    const loaded = await callMint(mint, () => run.deps.cashuWallet.load(mint))
    if (!loaded.ok) return loaded
    const wallet = loaded.value
    const owner = foreignKeysetOwner(
      mint,
      await run.deps.evolu.loadQuery(
        cashuProofsOfKeysetsQuery(
          wallet.keyChain.getKeysets().flatMap((keyset) => {
            const id = KeysetIdSchema.safeParse(keyset.id)
            return id.success ? [id.data] : []
          })
        )
      )
    )
    if (owner !== null)
      return err(
        createMintRejectedError({
          mint,
          code: null,
          detail: `its keyset belongs to ${owner}`,
          keysetOwner: owner,
        })
      )
    const keysetId = KeysetIdSchema.safeParse(wallet.keysetId)
    if (!keysetId.success)
      return err(
        createMintRejectedError({
          mint,
          code: null,
          detail: `wallet bound to non-hex keyset id "${wallet.keysetId}"`,
        })
      )
    const info = wallet.getMintInfo()
    return ok({
      mint,
      wallet,
      keysetId: keysetId.data,
      supports: (nut) =>
        nut === 17
          ? info.isSupported(17).supported
          : info.isSupported(nut).supported,
    })
  }

/**
 * What every Cashu Task may use (cashu/0012): the wallet and its database,
 * the app database the books live in, the counter locks, the nostr key that
 * locks quotes, and the clock.
 */
export type CashuDeps = CashuWalletDep &
  EvoluDep &
  EvoluOwnerDep &
  LockManagerDep &
  MasterKeyDep &
  DateDep

export type ProofAnswer = "unspent" | "pending" | "spent" | "unknown"

/**
 * NUT-07 over one mint, aligned to the input order. A missing or
 * unrecognised answer is `unknown`, never a guess.
 */
export const checkProofStates = async (
  loaded: LoadedCashuWallet,
  proofs: ReadonlyArray<{ readonly secret: string; readonly id: string }>
): Promise<Result<ReadonlyArray<ProofAnswer>, MintFailure>> => {
  if (proofs.length === 0) return ok([])
  const states = await callMint(loaded.mint, () =>
    loaded.wallet.checkProofsStates(
      proofs.map((proof) => ({ secret: proof.secret, id: proof.id }))
    )
  )
  if (!states.ok) return states
  const answers: ReadonlyArray<ProofState> = Array.isArray(states.value)
    ? states.value
    : []
  return ok(
    proofs.map((_, index) => {
      const state = answers[index]?.state.trim().toUpperCase()
      return state === "UNSPENT"
        ? "unspent"
        : state === "SPENT"
          ? "spent"
          : state === "PENDING"
            ? "pending"
            : "unknown"
    })
  )
}

/** NUT-02: the input fee of spending `count` proofs of one keyset. */
export const inputFeeOf = (
  loaded: LoadedCashuWallet,
  proofs: ReadonlyArray<{ readonly id: string }>
): number => amountToNumber(loaded.wallet.getFeesForProofs([...proofs]))
