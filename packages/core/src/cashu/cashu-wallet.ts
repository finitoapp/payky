import type {
  AmountLike,
  GetInfoResponse,
  JSONIntApi,
  KeyChainCache,
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
import type {
  AppOwnerSyncDep,
  DateDep,
  EvoluOwnerDep,
  FetchDep,
  MasterKeyDep,
} from "../deps.ts"
import {
  type CashuRequiredNut,
  cashuRequiredNuts,
  createCashuMintUnsupportedError,
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
import { mintErrorCode } from "./cashu-mint-errors.ts"

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
  readonly injectWebSocketImpl: typeof import("@cashu/cashu-ts").injectWebSocketImpl
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

/**
 * Where a mint's info and keysets are kept between sessions, so a wallet
 * loads without asking the mint first (`createCashuMintCache`).
 */
export interface CashuMintCache {
  readonly read: (mint: MintUrl) => Promise<{
    readonly info: GetInfoResponse
    readonly keychain: KeyChainCache
  } | null>
  readonly write: (
    mint: MintUrl,
    cached: { readonly info: GetInfoResponse; readonly keychain: KeyChainCache }
  ) => void
}

export interface CashuWalletDep {
  readonly cashuWallet: {
    readonly seed: CashuWalletSeed
    /**
     * A loaded wallet for `mint|sat`, cached; a failed load is not. It may
     * stand on the snapshot of an earlier session (`mintCache`).
     */
    readonly load: (mint: MintUrl) => Promise<Wallet>
    /**
     * The same wallet, its snapshot of the mint's keysets asked of the mint
     * in this session at least once: one loaded from the cache waits for its
     * refresh, and a refresh that failed is tried again, so a call that must
     * not derive outputs in a keyset the mint retired, or a check that must
     * see the mint's list as it is, does not stand on an earlier session's.
     */
    readonly loadCurrent: (mint: MintUrl) => Promise<Wallet>
    /**
     * Asks the mint for its info and keysets again now, in place, and keeps
     * them for a later session (cashu/0035).
     */
    readonly refresh: (mint: MintUrl) => Promise<Wallet>
    /** One load past the cache, for showing a mint's info; never derives outputs. */
    readonly loadFresh: (mint: MintUrl) => Promise<Wallet>
  }
}

/** A mint's wallet in this session, and its refresh from the mint. */
interface CashuWalletSession {
  readonly wallet: Wallet
  /** Asks the mint again; concurrent callers share one request. */
  readonly refresh: () => Promise<void>
  /** Resolves once the snapshot is this session's, refreshing when not. */
  readonly current: () => Promise<void>
}

export const createCashuWalletDep = ({
  seed,
  fetch,
  webSocket,
  mintCache,
}: {
  readonly seed: CashuWalletSeed
  readonly fetch: FetchDep["fetch"]
  /**
   * The `WebSocket` a mint's NUT-17 pushes come over, the platform's when
   * unset. cashu-ts takes one for the whole process, so a test's fake mints
   * set it for every wallet of that process.
   */
  readonly webSocket?: typeof WebSocket
  /**
   * Mints' info and keysets from an earlier session. A cached mint's wallet
   * loads from it at once and refreshes from the mint behind; a keyset the
   * cache missed is fetched when an operation needs it (cashu/0035).
   */
  readonly mintCache?: CashuMintCache
}): CashuWalletDep => {
  const sessions = new Map<string, Promise<CashuWalletSession>>()

  const loadWallet = async (
    mint: MintUrl,
    { cached }: { readonly cached: boolean }
  ): Promise<CashuWalletSession> => {
    const cashu = await loadCashuTs()
    if (webSocket !== undefined) cashu.injectWebSocketImpl(webSocket)
    const wallet = new cashu.Wallet(
      new cashu.Mint(mint, { customRequest: createMintRequest(cashu, fetch) }),
      { unit: "sat", bip39seed: seed }
    )
    // The cache is a convenience: a write that fails, as on an app
    // database closed by an account switch, leaves the next one to try.
    const save = (): void => {
      try {
        mintCache?.write(mint, {
          info: wallet.getMintInfo().cache,
          keychain: wallet.keyChain.cache,
        })
      } catch {}
    }
    const fromCache = cached && (await loadFromCache(wallet, mint))
    if (!fromCache) {
      await wallet.loadMint()
      save()
    }
    wallet.on.keychainUpdated(save)
    let isCurrent = !fromCache
    let refreshing: Promise<void> | null = null
    const refresh = (): Promise<void> => {
      refreshing ??= (async () => {
        try {
          await wallet.loadMint(true)
          isCurrent = true
          save()
        } finally {
          refreshing = null
        }
      })()
      return refreshing
    }
    // A failed refresh leaves the cached snapshot; operations still fetch
    // what they find missing, and `loadCurrent` asks again.
    if (fromCache) refresh().catch(() => {})
    return {
      wallet,
      refresh,
      // One that joined the refresh behind the cache as it failed asks once
      // more on its own.
      current: async () => {
        if (isCurrent) return
        try {
          await refresh()
        } catch {
          await refresh()
        }
      },
    }
  }

  const loadFromCache = async (
    wallet: Wallet,
    mint: MintUrl
  ): Promise<boolean> => {
    if (mintCache === undefined) return false
    try {
      const cached = await mintCache.read(mint)
      if (cached === null) return false
      wallet.loadMintFromCache(cached.info, cached.keychain)
      return true
    } catch {
      return false
    }
  }

  const session = (mint: MintUrl): Promise<CashuWalletSession> => {
    const key = `${mint}|sat`
    const cached = sessions.get(key)
    if (cached !== undefined) return cached
    const loading = loadWallet(mint, { cached: true })
    sessions.set(key, loading)
    loading.catch(() => {
      if (sessions.get(key) === loading) sessions.delete(key)
    })
    return loading
  }

  return {
    cashuWallet: {
      seed,
      load: async (mint) => (await session(mint)).wallet,
      loadCurrent: async (mint) => {
        const loaded = await session(mint)
        await loaded.current()
        return loaded.wallet
      },
      refresh: async (mint) => {
        const loaded = await session(mint)
        await loaded.refresh()
        return loaded.wallet
      },
      loadFresh: async (mint) =>
        (await loadWallet(mint, { cached: false })).wallet,
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

/**
 * Only the mint's own word refuses a call: an answer with a NUT-00 code is
 * `MintRejected` (cashu/0029), as is a keyset id the mint's keyset list
 * does not hold (cashu/0035). Anything else leaves the call's outcome
 * unknown, as a lost answer does — the network, a 5xx, a body that would
 * not parse, a proxy's 4xx, a failure after a signed answer — and is
 * `MintUnreachable`: tried again, never taken for a refusal (cashu/0030).
 */
export const classifyMintError = (
  mint: MintUrl,
  error: unknown
): MintFailure => {
  const detail = errorText(error)
  const code = mintErrorCode(error)
  if (code !== null) return createMintRejectedError({ mint, code, detail })
  // A keyset id the mint's keyset list does not hold, once cashu-ts has
  // asked it; unasked, the id may still resolve (cashu/0035).
  if (error instanceof Error && error.name === "UnknownKeysetError")
    return "refreshed" in error && error.refreshed === true
      ? createMintRejectedError({ mint, code: null, detail })
      : createMintUnreachableError({ mint, detail })
  return createMintUnreachableError({ mint, detail })
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
 * Makes keyset ids from outside the wallet — a token's, another device's
 * attempts — operable before they are used: cashu-ts refreshes its
 * snapshot of the mint's keysets in place, once and shared, for an id it
 * does not know (cashu/0035). An id the mint does not list either is
 * `MintRejected`.
 */
export const ensureCashuKeysets = (
  loaded: LoadedCashuWallet,
  keysetIds: ReadonlyArray<string>
): Promise<Result<void, MintFailure>> =>
  callMint(loaded.mint, () =>
    loaded.wallet.ensureOperableKeysets([...new Set(keysetIds)])
  )

/**
 * A mint call as a `Result` that keeps the raw error, for a caller that
 * tells a collision, a spent token or an issued quote apart before it
 * classifies what is left.
 */
export const tryMint = async <T>(
  call: () => Promise<T>
): Promise<Result<T, unknown>> => {
  try {
    return ok(await call())
  } catch (error) {
    return err(error)
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
  /**
   * 17: the mint pushes a bolt11 mint quote's state over its websocket
   * (`bolt11_mint_quote`); 20: it locks mint quotes to a key.
   */
  readonly supports: (nut: 17 | 20) => boolean
}

/**
 * The NUTs Payky's wallet stands on that the mint's info does not list
 * (cashu/0033): every reclaim, melt and restore asks the mint for proof
 * states (NUT-07) or signed outputs (NUT-09).
 */
export const missingCashuNuts = (info: {
  readonly isSupported: (nut: CashuRequiredNut) => {
    readonly supported: boolean
  }
}): ReadonlyArray<CashuRequiredNut> =>
  cashuRequiredNuts.filter((nut) => !info.isSupported(nut).supported)

/**
 * Loads the mint and refuses it when it lists a keyset another mint owns,
 * checked on every load: proofs synced since may now own a keyset. A mint
 * that does not list NUT-07 and NUT-09 is refused too, before anything is
 * written or sent (cashu/0033).
 *
 * `keysets` says how recent the snapshot of the mint's keysets must be:
 * `cached`, any, an earlier session's included; `session`, read from the
 * mint in this session (`loadCurrent`), for a call that derives outputs it
 * cannot try again; `now`, asked of the mint now (`refresh`), for a check
 * that must see the mint as it is.
 */
export const loadCashuWallet =
  (
    mint: MintUrl,
    {
      keysets = "cached",
    }: { readonly keysets?: "cached" | "session" | "now" } = {}
  ): Task<LoadedCashuWallet, MintFailure, CashuWalletDep & EvoluDep> =>
  async (run) => {
    const { cashuWallet } = run.deps
    const loaded = await callMint(mint, () =>
      keysets === "now"
        ? cashuWallet.refresh(mint)
        : keysets === "session"
          ? cashuWallet.loadCurrent(mint)
          : cashuWallet.load(mint)
    )
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
    const missingNuts = missingCashuNuts(wallet.getMintInfo())
    if (missingNuts.length > 0)
      return err(createCashuMintUnsupportedError({ mint, missingNuts }))
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
          ? (info
              .isSupported(17)
              .params?.some(
                (support) =>
                  support.method === "bolt11" &&
                  support.unit === "sat" &&
                  support.commands.includes("bolt11_mint_quote")
              ) ?? false)
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
  DateDep &
  AppOwnerSyncDep

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
