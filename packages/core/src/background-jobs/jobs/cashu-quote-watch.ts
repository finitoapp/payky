import type { Run } from "@evolu/common"
import { loadCashuWallet } from "../../cashu/cashu-wallet.ts"
import { pendingCashuTopupsQuery } from "../../modules/cashu/cashu-queries.ts"
import type {
  CashuOperationId,
  CashuQuoteId,
  MintUrl,
} from "../../modules/cashu/cashu-types.ts"
import { cashuTopupOperationIdFor } from "../../modules/cashu/cashu-utils.ts"
import type { CashuBackgroundJobContext } from "../background-job-types.ts"

/** How long after a subscription fails or ends it is first opened again. */
const RESUBSCRIBE_FIRST_MS = 30_000
/** The longest wait between two tries, past repeated failures. */
const RESUBSCRIBE_MAX_MS = 15 * 60_000

interface Watched {
  /** The quote ids subscribed, sorted and joined: what to compare. */
  readonly key: string
  /** Cancels the subscription and closes the mint's socket. */
  readonly end: () => void
}

/**
 * NUT-17 subscriptions to the mint quotes of pending topups, at every mint
 * that pushes a bolt11 mint quote's state. A quote reported PAID only wakes
 * the account sync job for that topup: the claim still goes the way a poll
 * takes it, so the mint's push decides nothing. A mint that does not
 * push, a socket that fails or closes, leaves the topup to the poll.
 *
 * A subscription is opened behind the job, never awaited by it, so a socket
 * that hangs delays no claim. One that fails or ends is opened again on a
 * later `refresh`, each time after a longer wait. A mint whose quotes are
 * no longer watched, and every mint once stopped, has its socket closed:
 * the quote watch is the only user of a mint's socket.
 */
export const createCashuQuoteWatch = (
  run: Run<CashuBackgroundJobContext>,
  onPaid: (topupId: CashuOperationId) => void
) => {
  const watched = new Map<MintUrl, Watched>()
  const failures = new Map<
    MintUrl,
    { readonly count: number; readonly retryAtMs: number }
  >()
  let stopped = false
  const nowMs = () => run.deps.date.now().getTime()

  // Out of the map first: a socket closing as it ends is not the end of a
  // current subscription.
  const unwatch = (mint: MintUrl): void => {
    const entry = watched.get(mint)
    watched.delete(mint)
    entry?.end()
  }

  const open = async (
    mint: MintUrl,
    quoteIds: ReadonlyArray<CashuQuoteId>,
    isCurrent: () => boolean,
    onOpened: (end: () => void) => void,
    failed: () => void
  ): Promise<void> => {
    const loaded = await run(loadCashuWallet(mint))
    // Unreachable now: asked again on a later refresh, as a poll is.
    if (!loaded.ok) return failed()
    if (!isCurrent() || !loaded.value.supports(17)) return
    const socket = loaded.value.wallet.mint
    try {
      const cancel = await loaded.value.wallet.on.mintQuoteUpdates(
        [...quoteIds],
        (quote) => {
          if (quote.state !== "PAID") return
          const quoteId = quoteIds.find((id) => id === quote.quote)
          if (quoteId !== undefined)
            onPaid(cashuTopupOperationIdFor(mint, quoteId))
        },
        (error) => {
          run.deps.console.info("Cashu quote subscription ended.", {
            mint,
            error: String(error),
          })
          failed()
        }
      )
      const end = () => {
        cancel()
        socket.disconnectWebSocket()
      }
      if (isCurrent()) onOpened(end)
      // Replaced while it opened: the newer one keeps the socket.
      else if (watched.has(mint)) cancel()
      else end()
    } catch (error) {
      run.deps.console.info("Cashu quote subscription failed.", {
        mint,
        error: String(error),
      })
      failed()
    }
  }

  const watch = (mint: MintUrl, quoteIds: ReadonlyArray<CashuQuoteId>) => {
    const key = [...quoteIds].sort().join(" ")
    if (watched.get(mint)?.key === key) return
    if ((failures.get(mint)?.retryAtMs ?? 0) > nowMs()) return
    unwatch(mint)
    // Held while the subscription is opened, so a refresh racing it does
    // not open a second one; a mint that does not push keeps it, so it is
    // not asked again until its quotes change.
    let end: () => void = () => {}
    const entry: Watched = { key, end: () => end() }
    watched.set(mint, entry)
    const isCurrent = () => !stopped && watched.get(mint) === entry
    const failed = () => {
      if (!isCurrent()) return
      unwatch(mint)
      const count = (failures.get(mint)?.count ?? 0) + 1
      failures.set(mint, {
        count,
        retryAtMs:
          nowMs() +
          Math.min(RESUBSCRIBE_MAX_MS, RESUBSCRIBE_FIRST_MS * 2 ** (count - 1)),
      })
    }
    void open(
      mint,
      quoteIds,
      isCurrent,
      (opened) => {
        end = opened
        failures.delete(mint)
      },
      failed
    ).catch(failed)
  }

  return {
    /**
     * Subscribes to the pending topups' quotes, and to no others. Returns
     * once the subscriptions are asked for, not opened.
     */
    refresh: async (): Promise<void> => {
      if (stopped) return
      const byMint = new Map<MintUrl, CashuQuoteId[]>()
      for (const topup of await run.deps.evolu.loadQuery(
        pendingCashuTopupsQuery
      ))
        if (topup.quoteId !== null)
          byMint.set(topup.mintUrl, [
            ...(byMint.get(topup.mintUrl) ?? []),
            topup.quoteId,
          ])
      if (stopped) return
      for (const mint of [...watched.keys()])
        if (!byMint.has(mint)) unwatch(mint)
      for (const mint of [...failures.keys()])
        if (!byMint.has(mint)) failures.delete(mint)
      for (const [mint, quoteIds] of byMint) watch(mint, quoteIds)
    },
    /** Drops every subscription; a later `refresh` opens them again. */
    clear: (): void => {
      for (const mint of [...watched.keys()]) unwatch(mint)
      failures.clear()
    },
    /** Drops every subscription for good. */
    stop: (): void => {
      stopped = true
      for (const mint of [...watched.keys()]) unwatch(mint)
    },
  }
}
