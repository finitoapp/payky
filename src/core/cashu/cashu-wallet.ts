import type {
  LinkshuServices,
  OperationStore,
  ProofStore,
  TopupHandle,
} from "@linky/linkshu"
import { sha256 } from "@noble/hashes/sha2.js"
import { bytesToHex } from "@noble/hashes/utils.js"
import type { Layer, ManagedRuntime, Scope } from "effect"

import {
  type CashuKeyValueStorage,
  createCashuKeyValueStore,
} from "@/core/cashu/cashu-key-value-store.ts"
import {
  type LinkshuModules,
  loadLinkshuModules,
} from "@/core/cashu/cashu-linkshu.ts"
import type { CashuWalletSeed } from "@/core/modules/shared/key-derivation.ts"

/**
 * Where the proofs and operations live: `@linky/linksync`'s wallet
 * repository over Linky's cashu shards, so this wallet and Linky's are one
 * inventory. Resolved lazily — opening the Linky store is the expensive part
 * and a terminal without a cashu account never needs it.
 */
export interface CashuWalletStores {
  readonly proofStore: Layer.Layer<ProofStore>
  readonly operationStore: Layer.Layer<OperationStore>
  /** Fires after a change to the inventory, local or synced. */
  readonly subscribe: (listener: () => void) => () => void
}

export interface CashuTopupQuote {
  readonly quoteId: string
  readonly mintUrl: string
  readonly amountSats: number
  readonly invoice: string
  readonly expiresAtMs: number | null
}

export interface CashuTopupReceipt {
  readonly quoteId: string
  readonly mintUrl: string
  readonly amountSats: number
  readonly invoice: string
}

export interface CashuMintBalance {
  readonly mintUrl: string
  readonly amountSats: number
}

export interface CashuWalletBalances {
  readonly totalSats: number
  /** The largest single-mint balance; cashu cannot spend across mints. */
  readonly spendableSats: number
  readonly perMint: ReadonlyArray<CashuMintBalance>
}

export interface CashuRestoreReport {
  readonly restoredSats: number
  readonly restoredProofs: number
  readonly scannedMints: ReadonlyArray<string>
  readonly unavailableMints: ReadonlyArray<string>
}

/**
 * A wallet operation the library refused or could not finish. `tag` is the
 * library's tagged error name (`MintUnreachable`, `MintRejected`, ...), for
 * callers that branch on it; `message` is for logs and the preparation error.
 */
export class CashuWalletError extends Error {
  readonly tag: string

  constructor(tag: string, detail: string | undefined) {
    super(detail === undefined ? tag : `${tag}: ${detail}`)
    this.name = "CashuWalletError"
    this.tag = tag
  }
}

/**
 * Payky's boundary around `@linky/linkshu`: plain promises over plain values,
 * with the Effect runtime, the stores and the seed kept inside. Do not build
 * a linkshu runtime anywhere else; extend this when a consumer needs more of
 * the library.
 */
export interface CashuWallet extends AsyncDisposable {
  /**
   * Requests a mint quote for `amountSats` and starts watching it. The topup
   * completes on its own once the invoice is paid; `subscribeTopupSettled`
   * reports it.
   */
  readonly startTopup: (params: {
    readonly mintUrl: string
    readonly amountSats: number
  }) => Promise<CashuTopupQuote>
  /**
   * Makes sure every pending topup the stores know has a live watcher — after
   * a restart, when connectivity returns, and whenever a watcher gave up.
   * Cheap when nothing is pending; safe to call repeatedly.
   */
  readonly watchPendingTopups: () => Promise<void>
  readonly subscribeTopupSettled: (
    listener: (receipt: CashuTopupReceipt) => void
  ) => () => void
  readonly getBalances: () => Promise<CashuWalletBalances>
  /** Fires when the proof or operation inventory changes, locally or via sync. */
  readonly subscribeInventory: (listener: () => void) => () => void
  /** NUT-09 recovery of this seed's proofs from the given mints. */
  readonly restore: (params: {
    readonly mintUrls: ReadonlyArray<string>
  }) => Promise<CashuRestoreReport>
  /**
   * The token inside `text` (bare, `cashu:`-prefixed, or in a URL) and what
   * it is worth, without touching the mint; `null` when there is none or the
   * encoding does not say which mint.
   */
  readonly describeToken: (text: string) => Promise<CashuTokenSummary | null>
  /** The proofs a NUT-18 payment payload carries, as token text; `null` when they do not form a token. */
  readonly encodeToken: (token: CashuTokenDraft) => Promise<string | null>
  /**
   * Swaps the token's proofs at the mint into this wallet's inventory. The
   * two expected refusals are outcomes, not errors: the wallet already holds
   * the token (this app or Linky received it), or the mint reports its proofs
   * spent (someone else did — maybe Linky, before its record synced).
   */
  readonly receiveToken: (text: string) => Promise<CashuReceiveOutcome>
  /** The finished `receive` this wallet has for exactly `tokenText`, whichever app made it. */
  readonly findReceivedTransfer: (
    tokenText: string
  ) => Promise<CashuReceivedTransfer | null>
}

export interface CashuTokenSummary {
  /** The token as the wallet identifies it: extracted and normalized. */
  readonly tokenText: string
  readonly mintUrl: string
  /** Face value, before any swap fee the mint takes on receipt. */
  readonly amountSats: number
}

export interface CashuTokenDraft {
  readonly mintUrl: string
  readonly unit: string
  readonly proofs: ReadonlyArray<{
    readonly id: string
    readonly amount: number
    readonly secret: string
    readonly C: string
  }>
}

export type CashuReceiveOutcome =
  | {
      readonly kind: "received"
      readonly operationId: string
      readonly mintUrl: string
      /** What landed in the wallet, after the mint's swap fee. */
      readonly amountSats: number
    }
  | { readonly kind: "alreadyKnown"; readonly operationId: string | null }
  | { readonly kind: "alreadySpent" }

export interface CashuReceivedTransfer {
  readonly operationId: string
  readonly mintUrl: string
  readonly amountSats: number
}

/**
 * `null` where no account master key exists to derive a wallet from — the
 * CLI runs as Evolu's test owner. Jobs and actions treat it as "no cashu".
 */
export type CashuWalletDep = {
  readonly cashuWallet: CashuWallet | null
}

interface LoadedCashuRuntime {
  readonly modules: LinkshuModules
  readonly runtime: ManagedRuntime.ManagedRuntime<LinkshuServices, never>
  readonly stores: CashuWalletStores
}

interface TopupErrorLike {
  readonly _tag: string
  readonly detail?: unknown
}

const toWalletError = (error: TopupErrorLike): CashuWalletError =>
  new CashuWalletError(
    error._tag,
    typeof error.detail === "string" ? error.detail : undefined
  )

const seedNamespace = (seed: CashuWalletSeed): string =>
  `payky.linkshu.${bytesToHex(sha256(seed)).slice(0, 16)}`

export const createCashuWallet = ({
  seed,
  storage,
  loadStores,
  loadModules = loadLinkshuModules,
}: {
  readonly seed: CashuWalletSeed
  readonly storage: CashuKeyValueStorage
  readonly loadStores: () => Promise<CashuWalletStores>
  readonly loadModules?: () => Promise<LinkshuModules>
}): CashuWallet => {
  let loaded: Promise<LoadedCashuRuntime> | undefined
  let disposed = false
  const settledListeners = new Set<(receipt: CashuTopupReceipt) => void>()
  // Every topup watcher is forked into the current scope. `watchPendingTopups`
  // replaces the scope wholesale — the library forks a fresh watcher for each
  // pending record on every resume, so closing the previous scope is what
  // keeps one watcher per quote instead of one per resume call.
  let topupScope: Scope.CloseableScope | null = null
  const liveTopups = new Map<string, Scope.CloseableScope>()
  let watcherGaveUp = false

  const load = (): Promise<LoadedCashuRuntime> => {
    loaded ??= (async () => {
      const [modules, stores] = await Promise.all([loadModules(), loadStores()])
      const { linkshu, effect } = modules
      const runtime = effect.ManagedRuntime.make(
        linkshu
          .linkshuServices({
            bip39Seed: linkshu.Bip39Seed.make(seed),
            keyValueStore: createCashuKeyValueStore(modules, {
              storage,
              namespace: seedNamespace(seed),
            }),
            proofStore: stores.proofStore,
            operationStore: stores.operationStore,
          })
          .pipe(effect.Layer.provideMerge(linkshu.Inspector.disabled))
      )
      return { modules, runtime, stores }
    })()

    return loaded
  }

  const currentScope = ({ effect }: LinkshuModules): Scope.CloseableScope => {
    topupScope ??= effect.Effect.runSync(effect.Scope.make())
    return topupScope
  }

  const closeScope = async (
    { effect }: LinkshuModules,
    scope: Scope.CloseableScope
  ): Promise<void> => {
    await effect.Effect.runPromise(effect.Scope.close(scope, effect.Exit.void))
  }

  const topupKey = (quote: TopupHandle["quote"]): string =>
    `${quote.mint}|${quote.quoteId}`

  const track = (
    { runtime, modules: { effect } }: LoadedCashuRuntime,
    scope: Scope.CloseableScope,
    handle: TopupHandle
  ): void => {
    const key = topupKey(handle.quote)
    liveTopups.set(key, scope)

    const release = () => {
      if (liveTopups.get(key) === scope) liveTopups.delete(key)
    }

    runtime
      .runPromise(effect.Effect.either(handle.result))
      .then((outcome) => {
        release()
        if (effect.Either.isLeft(outcome)) {
          // An expired quote is closed for good; anything else left the
          // record pending for a later resume to pick up.
          if (outcome.left._tag !== "QuoteExpired") watcherGaveUp = true
          return
        }
        const receipt: CashuTopupReceipt = {
          quoteId: outcome.right.quoteId,
          mintUrl: outcome.right.mint,
          amountSats: outcome.right.amount,
          invoice: handle.quote.invoice,
        }
        for (const listener of settledListeners) listener(receipt)
      })
      // A rejection here means the watcher was interrupted with its scope —
      // a resume replaced it or the wallet is shutting down.
      .catch(release)
  }

  const startTopup: CashuWallet["startTopup"] = async ({
    mintUrl,
    amountSats,
  }) => {
    const rt = await load()
    const { linkshu, effect } = rt.modules
    const mint = linkshu.parseMintUrl(mintUrl)
    if (mint === null) {
      throw new CashuWalletError("InvalidMintUrl", mintUrl)
    }

    const scope = currentScope(rt.modules)
    const outcome = await rt.runtime.runPromise(
      effect.Effect.either(
        effect.Scope.extend(
          effect.Effect.flatMap(linkshu.Topup, (topup) =>
            topup.start(
              new linkshu.TopupDraft({
                mint,
                amount: linkshu.Amount.make(amountSats),
              })
            )
          ),
          scope
        )
      )
    )
    if (effect.Either.isLeft(outcome)) throw toWalletError(outcome.left)

    const handle = outcome.right
    track(rt, scope, handle)

    return {
      quoteId: handle.quote.quoteId,
      mintUrl: handle.quote.mint,
      amountSats: handle.quote.amount,
      invoice: handle.quote.invoice,
      expiresAtMs:
        handle.quote.expiresAt === null ? null : handle.quote.expiresAt * 1000,
    }
  }

  const watchPendingTopups: CashuWallet["watchPendingTopups"] = async () => {
    if (liveTopups.size > 0 && !watcherGaveUp) return

    const rt = await load()
    if (disposed) return
    const { linkshu, effect } = rt.modules
    watcherGaveUp = false

    const nextScope = effect.Effect.runSync(effect.Scope.make())
    let handles: ReadonlyArray<TopupHandle>
    try {
      handles = await rt.runtime.runPromise(
        effect.Scope.extend(
          effect.Effect.flatMap(linkshu.Topup, (topup) =>
            topup.resumePending()
          ),
          nextScope
        )
      )
    } catch (error) {
      await closeScope(rt.modules, nextScope)
      throw error
    }

    const previousScope = topupScope
    topupScope = nextScope
    if (previousScope !== null) await closeScope(rt.modules, previousScope)
    for (const handle of handles) track(rt, nextScope, handle)
  }

  const getBalances: CashuWallet["getBalances"] = async () => {
    const rt = await load()
    const { linkshu, effect } = rt.modules
    const balances = await rt.runtime.runPromise(
      effect.Effect.flatMap(linkshu.Tokens, (tokens) => tokens.balances)
    )

    return {
      totalSats: balances.total,
      spendableSats: balances.spendable,
      perMint: balances.perMint.map((entry) => ({
        mintUrl: entry.mint,
        amountSats: entry.amount,
      })),
    }
  }

  const restore: CashuWallet["restore"] = async ({ mintUrls }) => {
    const rt = await load()
    const { linkshu, effect } = rt.modules
    const mints = mintUrls.map((mintUrl) => {
      const mint = linkshu.parseMintUrl(mintUrl)
      if (mint === null) throw new CashuWalletError("InvalidMintUrl", mintUrl)
      return mint
    })
    const report = await rt.runtime.runPromise(
      effect.Effect.flatMap(linkshu.Restore, (restoreService) =>
        restoreService.restore(new linkshu.RestoreDraft({ mints }))
      )
    )

    return {
      restoredSats: report.restoredAmount,
      restoredProofs: report.restoredProofs,
      scannedMints: report.scannedMints,
      unavailableMints: report.unavailableMints,
    }
  }

  const describeToken: CashuWallet["describeToken"] = async (text) => {
    const { linkshu } = await loadModules()
    const tokenText = linkshu.extractTokenText(text)
    if (tokenText === null) return null
    const parsed = linkshu.parseTokenText(tokenText)
    if (parsed === null || parsed.mint === null) return null
    return { tokenText, mintUrl: parsed.mint, amountSats: parsed.amount }
  }

  const encodeToken: CashuWallet["encodeToken"] = async (token) => {
    const { linkshu, effect } = await loadModules()
    const mint = linkshu.parseMintUrl(token.mintUrl)
    if (mint === null) return null
    const decoded = effect.Schema.decodeUnknownEither(linkshu.DecodedToken)({
      mint,
      unit: token.unit,
      memo: null,
      proofs: token.proofs,
    })
    return effect.Either.isLeft(decoded)
      ? null
      : linkshu.encodeToken(decoded.right)
  }

  const receiveToken: CashuWallet["receiveToken"] = async (text) => {
    const rt = await load()
    const { linkshu, effect } = rt.modules
    const outcome = await rt.runtime.runPromise(
      effect.Effect.either(
        effect.Effect.flatMap(linkshu.Receive, (receive) =>
          receive.receive(new linkshu.ReceiveDraft({ text }))
        )
      )
    )
    if (effect.Either.isRight(outcome)) {
      return {
        kind: "received",
        operationId: outcome.right.operationId,
        mintUrl: outcome.right.mint,
        amountSats: outcome.right.amount,
      }
    }
    const error = outcome.left
    if (error._tag === "TokenAlreadyKnown") {
      return { kind: "alreadyKnown", operationId: error.operationId }
    }
    if (error._tag === "TokenAlreadySpent") return { kind: "alreadySpent" }
    throw toWalletError(error)
  }

  const findReceivedTransfer: CashuWallet["findReceivedTransfer"] = async (
    tokenText
  ) => {
    const rt = await load()
    const { linkshu, effect } = rt.modules
    const transfers = await rt.runtime.runPromise(
      effect.Effect.flatMap(linkshu.Tokens, (tokens) => tokens.transfers)
    )
    const transfer = transfers.find(
      (candidate) =>
        candidate.kind === "receive" &&
        candidate.status === "done" &&
        candidate.tokenText === tokenText
    )
    return transfer === undefined
      ? null
      : {
          operationId: transfer.id,
          mintUrl: transfer.mint,
          amountSats: transfer.amount,
        }
  }

  const subscribeInventory: CashuWallet["subscribeInventory"] = (listener) => {
    let unsubscribe: (() => void) | undefined
    let active = true
    void load().then((rt) => {
      if (active) unsubscribe = rt.stores.subscribe(listener)
    })

    return () => {
      active = false
      unsubscribe?.()
    }
  }

  return {
    startTopup,
    watchPendingTopups,
    subscribeTopupSettled: (listener) => {
      settledListeners.add(listener)
      return () => {
        settledListeners.delete(listener)
      }
    },
    getBalances,
    subscribeInventory,
    restore,
    describeToken,
    encodeToken,
    receiveToken,
    findReceivedTransfer,
    async [Symbol.asyncDispose]() {
      if (disposed) return
      disposed = true
      settledListeners.clear()
      if (loaded === undefined) return

      const rt = await loaded
      if (topupScope !== null) {
        await closeScope(rt.modules, topupScope)
        topupScope = null
      }
      liveTopups.clear()
      await rt.runtime.dispose()
    },
  }
}
