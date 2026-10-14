import { ok, type Run, sqliteTrue } from "@evolu/common"

import type {
  CashuBackgroundJob,
  CashuBackgroundJobContext,
} from "@/core/background-jobs/background-job-types.ts"
import { createKeyedTaskQueue } from "@/core/background-jobs/keyed-task-queue.ts"
import { bookCashuOperations } from "@/core/cashu/cashu-booking.ts"
import { resumeCashuMelt } from "@/core/cashu/cashu-melt.ts"
import { createCashuTokenListener } from "@/core/cashu/cashu-token-listener.ts"
import {
  claimCashuTopup,
  reclaimTopupFromCounter,
} from "@/core/cashu/cashu-topup.ts"
import { loadCashuWallet } from "@/core/cashu/cashu-wallet.ts"
import { cashuClaimAttemptQuery } from "@/core/evolu/device-cashu.ts"
import { cashuAccountQuery } from "@/core/modules/account/account-queries.ts"
import type { CashuOperationCopy } from "@/core/modules/cashu/cashu-queries.ts"
import type { CashuOperationId } from "@/core/modules/cashu/cashu-types.ts"
import { cashuPaymentQuotesQuery } from "@/core/modules/payment/payment-queries.ts"

/**
 * The Cashu account's sync (cashu.md §5): settles the Lightning leg of
 * Payky's Cashu payments and books every incoming operation of the shared
 * wallet. Runs on native and browser while a Cashu account is enabled; the
 * CLI has no Linky owners.
 *
 * Each pending topup a payment holds is polled on Linky's schedule, counted
 * from the quote's creation: every 5 s for 5 minutes, every minute up to an
 * hour, then every 5 minutes. A paid quote is claimed; a claim made
 * elsewhere is waited for, and reclaimed from its synced counter after a
 * grace period when the winner's rows never arrive (decision 11).
 *
 * ponytail: polling only; a NUT-17 subscription would shorten the first
 * seconds after payment, add it if 5 s proves too slow at the till.
 */

const TICK_MS = 5_000
const BOOKING_FALLBACK_MS = 60_000
/** How long a claim made elsewhere may take to sync before Payky reclaims. */
export const CLAIMED_ELSEWHERE_GRACE_MS = 5 * 60_000

const pollIntervalMs = (ageSeconds: number): number =>
  ageSeconds < 5 * 60 ? 5_000 : ageSeconds < 60 * 60 ? 60_000 : 5 * 60_000

type CashuJobRun = Run<CashuBackgroundJobContext>

export const startCashuAccountSyncJob: CashuBackgroundJob = (taskRun) => {
  // A fresh scope: the Task's own run is disposed as soon as it returns, but
  // the timers below keep composing Tasks for as long as the job runs.
  const run = taskRun.create({
    ...taskRun.deps,
    console: taskRun.deps.console.child("cashu-account-sync-job"),
  })
  const queue = createKeyedTaskQueue<"topups" | "booking" | "tokens">({
    onError: (error) => run.deps.onError(error),
  })
  const lastPolledMs = new Map<CashuOperationId, number>()
  const elsewhereSinceMs = new Map<CashuOperationId, number>()

  const isEnabled = async (): Promise<boolean> => {
    const [account] = await run.deps.evolu.loadQuery(cashuAccountQuery)
    return account !== undefined && account.isDeleted !== sqliteTrue
  }

  const settleTopup = async (
    jobRun: CashuJobRun,
    operation: CashuOperationCopy
  ): Promise<void> => {
    const claim = await jobRun(claimCashuTopup(operation.id))
    if (!claim.ok) {
      run.deps.console.warn("Cashu topup claim failed.", {
        operationId: operation.id,
        error: claim.error,
      })
      return
    }
    if (claim.value.type !== "claimedElsewhere") {
      elsewhereSinceMs.delete(operation.id)
      return
    }
    const nowMs = run.deps.date.now().getTime()
    const since = elsewhereSinceMs.get(operation.id) ?? nowMs
    elsewhereSinceMs.set(operation.id, since)
    const counter = claim.value.counter
    if (counter === null || nowMs - since < CLAIMED_ELSEWHERE_GRACE_MS) return
    const loaded = await jobRun(loadCashuWallet(operation.mint))
    if (!loaded.ok) return
    const reclaimed = await reclaimTopupFromCounter(
      jobRun.deps,
      loaded.value,
      operation,
      counter
    )
    if (reclaimed.ok && reclaimed.value.found)
      run.deps.console.info("Reclaimed a Cashu topup claimed elsewhere.", {
        operationId: operation.id,
      })
  }

  const settleTopups = async (): Promise<void> => {
    if (!(await isEnabled())) return
    const store = run.deps.cashuShardStore
    if (!store.isHydrated()) return
    const quotes = new Set(
      (await run.deps.evolu.loadQuery(cashuPaymentQuotesQuery)).map(
        (row) => `${row.mintUrl}|${row.quoteId}`
      )
    )
    const nowMs = run.deps.date.now().getTime()
    const operations = await store.loadOperations()
    // Payky's interrupted melts (a withdrawal, a move's source) settle by the
    // mint's answer; resuming one never sends again.
    for (const operation of operations) {
      if (operation.kind !== "melt" || operation.status !== "pending") continue
      const [attempt] = await run.deps.deviceEvolu.loadQuery(
        cashuClaimAttemptQuery(
          run.deps.cashuWallet.deviceAccountId,
          operation.id
        )
      )
      if (attempt === undefined) continue
      await run(resumeCashuMelt(operation.id))
    }
    const due = operations.filter((operation) => {
      const isPaykyTopup =
        operation.kind === "topup" &&
        operation.quoteId !== null &&
        quotes.has(`${operation.mint}|${operation.quoteId}`)
      // A move between mints; Linky drops an unclaimed one after a day.
      const isRecentMove =
        operation.kind === "autoswap" &&
        nowMs / 1000 - operation.createdAtSec < 24 * 60 * 60
      if (operation.status !== "pending" || !(isPaykyTopup || isRecentMove))
        return false
      const ageSeconds = nowMs / 1000 - operation.createdAtSec
      const last = lastPolledMs.get(operation.id) ?? 0
      return nowMs - last >= pollIntervalMs(ageSeconds)
    })
    for (const operation of due) {
      lastPolledMs.set(operation.id, nowMs)
      await settleTopup(run, operation)
    }
  }

  const book = async (): Promise<void> => {
    if (!(await isEnabled())) return
    const result = await run(bookCashuOperations)
    if (result.ok && result.value.booked > 0)
      run.deps.console.info("Booked Cashu operations.", result.value)
  }

  // Tokens over NIP-17: listened for whenever the Cashu account is enabled,
  // not only while a payment waits (decision 12).
  const tokens = createCashuTokenListener(run)
  const tokensSoon = () => queue.enqueue("tokens", tokens.tick)
  const followAccount = async (): Promise<void> => {
    if (await isEnabled()) await tokens.start(tokensSoon)
    else tokens.stop()
  }

  const settleSoon = () => {
    queue.enqueue("topups", settleTopups)
    tokensSoon()
  }
  const bookSoon = () => queue.enqueue("booking", book)

  const unsubscribeStore = run.deps.cashuShardStore.subscribe(bookSoon)
  const unsubscribeHydration = run.deps.cashuShardStore.subscribeHydration(
    () => {
      settleSoon()
      bookSoon()
    }
  )
  const unsubscribeAccount = run.deps.evolu.subscribeQuery(cashuAccountQuery)(
    () => {
      void followAccount()
      settleSoon()
      bookSoon()
    }
  )
  const tick = setInterval(settleSoon, TICK_MS)
  ;(tick as { readonly unref?: () => void }).unref?.()
  const bookingTick = setInterval(bookSoon, BOOKING_FALLBACK_MS)
  ;(bookingTick as { readonly unref?: () => void }).unref?.()

  run.deps.console.info("Started Cashu account sync job.")
  void followAccount()
  settleSoon()
  bookSoon()

  return ok({
    async [Symbol.asyncDispose]() {
      if (queue.isDisposed) return
      clearInterval(tick)
      clearInterval(bookingTick)
      tokens.stop()
      unsubscribeStore()
      unsubscribeHydration()
      unsubscribeAccount()
      await queue[Symbol.asyncDispose]()
      run.deps.console.info("Stopped Cashu account sync job.")
      await run[Symbol.asyncDispose]()
    },
  })
}
