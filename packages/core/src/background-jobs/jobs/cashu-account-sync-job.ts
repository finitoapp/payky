import { ok, sqliteTrue } from "@evolu/common"
import { loadCashuWallet } from "../../cashu/cashu-wallet.ts"
import { cashuAccountQuery } from "../../modules/account/account-queries.ts"
import {
  loadCashuTopup,
  loadOwnCashuAttempt,
} from "../../modules/cashu/cashu-guards.ts"
import { resumeCashuMelt } from "../../modules/cashu/cashu-melt-actions.ts"
import { loadCashuMoveSettlement } from "../../modules/cashu/cashu-move-actions.ts"
import {
  pendingCashuMeltsQuery,
  pendingCashuTopupsQuery,
} from "../../modules/cashu/cashu-queries.ts"
import {
  claimCashuTopup,
  reclaimCashuTopup,
} from "../../modules/cashu/cashu-topup-actions.ts"
import type { CashuOperationId } from "../../modules/cashu/cashu-types.ts"
import { loadCashuWithdrawalSettlement } from "../../modules/withdraw/withdraw-cashu-actions.ts"
import type { CashuBackgroundJob } from "../background-job-types.ts"
import { createKeyedTaskQueue } from "../keyed-task-queue.ts"
import { createCashuTokenListener } from "./cashu-token-listener.ts"

/**
 * The Cashu account's sync (cashu/0012): claims the topups of Payky's
 * payments and moves, resumes interrupted melts, and receives tokens. Each
 * completes with its booking in one batch (cashu/0014), so nothing is left
 * to catch up. Runs on native and browser while a Cashu account is
 * enabled.
 *
 * Each pending topup is polled on a schedule counted from its creation:
 * every 5 s for 5 minutes, every minute up to an hour, then every 5 minutes.
 * A paid quote is claimed; a claim another device makes is waited for, and
 * reclaimed from its synced counter after a grace period when that device's
 * rows never arrive (cashu/0015).
 *
 * ponytail: polling only; a NUT-17 subscription would shorten the first
 * seconds after payment, add it if 5 s proves too slow at the till.
 */

const TICK_MS = 5_000
/** How long a claim made elsewhere may take to sync before Payky reclaims. */
export const CLAIMED_ELSEWHERE_GRACE_MS = 5 * 60_000
/** A move's topup nobody claimed within a day is left alone. */
const MOVE_CLAIM_WINDOW_MS = 24 * 60 * 60_000

const pollIntervalMs = (ageMs: number): number =>
  ageMs < 5 * 60_000 ? 5_000 : ageMs < 60 * 60_000 ? 60_000 : 5 * 60_000

export const startCashuAccountSyncJob: CashuBackgroundJob = (taskRun) => {
  // A fresh scope: the Task's own run is disposed as soon as it returns, but
  // the timers below keep composing Tasks for as long as the job runs.
  const run = taskRun.create({
    ...taskRun.deps,
    console: taskRun.deps.console.child("cashu-account-sync-job"),
  })
  const queue = createKeyedTaskQueue<"topups" | "tokens">({
    onError: (error) => run.deps.onError(error),
  })
  const lastPolledMs = new Map<CashuOperationId, number>()
  const elsewhereSinceMs = new Map<CashuOperationId, number>()

  const isEnabled = async (): Promise<boolean> => {
    const [account] = await run.deps.evolu.loadQuery(cashuAccountQuery)
    return account !== undefined && account.isDeleted !== sqliteTrue
  }

  /** Reclaims a claim made elsewhere once its grace period is over. */
  const reclaimAfterGrace = async (
    operationId: CashuOperationId,
    counter: number | null
  ): Promise<void> => {
    const nowMs = run.deps.date.now().getTime()
    const since = elsewhereSinceMs.get(operationId) ?? nowMs
    elsewhereSinceMs.set(operationId, since)
    if (counter === null || nowMs - since < CLAIMED_ELSEWHERE_GRACE_MS) return
    const topup = await run.ok(loadCashuTopup(operationId))
    if (topup === null) return
    const loaded = await run(loadCashuWallet(topup.mintUrl))
    if (!loaded.ok) return
    const reclaimed = await run(reclaimCashuTopup(loaded.value, topup, counter))
    if (!reclaimed.ok || !reclaimed.value.found) return
    run.deps.console.info("Reclaimed a Cashu topup claimed elsewhere.", {
      operationId,
    })
  }

  const claimTopup = async (operationId: CashuOperationId): Promise<void> => {
    const claim = await run(claimCashuTopup(operationId))
    if (!claim.ok) {
      run.deps.console.warn("Cashu topup claim failed.", {
        operationId,
        error: claim.error,
      })
      return
    }
    if (claim.value.type === "claimedElsewhere")
      await reclaimAfterGrace(operationId, claim.value.counter)
    else elsewhereSinceMs.delete(operationId)
  }

  /**
   * This device's interrupted melts (a withdrawal, a move's source), each
   * settled with its owner's rows in one batch (cashu/0014).
   */
  const resumeMelts = async (): Promise<void> => {
    const melts = await run.deps.evolu.loadQuery(pendingCashuMeltsQuery)
    for (const { id } of melts) {
      // Only the device that sent a melt resumes it.
      if ((await run.ok(loadOwnCashuAttempt(id))) === null) continue
      const settlement =
        (await run.ok(loadCashuWithdrawalSettlement(id))) ??
        (await run.ok(loadCashuMoveSettlement(id))) ??
        undefined
      await run(resumeCashuMelt(id, settlement))
    }
  }

  const settleTopups = async (): Promise<void> => {
    if (!(await isEnabled())) return
    await resumeMelts()
    const nowMs = run.deps.date.now().getTime()
    const topups = await run.deps.evolu.loadQuery(pendingCashuTopupsQuery)
    const due = topups.filter((topup) => {
      const ageMs = nowMs - Date.parse(topup.createdAt)
      if (topup.purpose === "move" && ageMs > MOVE_CLAIM_WINDOW_MS) return false
      const last = lastPolledMs.get(topup.id) ?? 0
      return nowMs - last >= pollIntervalMs(ageMs)
    })
    for (const topup of due) {
      lastPolledMs.set(topup.id, nowMs)
      await claimTopup(topup.id)
    }
  }

  // Tokens over NIP-17: listened for whenever the Cashu account is enabled,
  // not only while a payment waits (cashu/0008).
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
  const unsubscribeAccount = run.deps.evolu.subscribeQuery(cashuAccountQuery)(
    () => {
      void followAccount()
      settleSoon()
    }
  )
  const tick = setInterval(settleSoon, TICK_MS)
  ;(tick as { readonly unref?: () => void }).unref?.()

  run.deps.console.info("Started Cashu account sync job.")
  void followAccount()
  settleSoon()

  return ok({
    async [Symbol.asyncDispose]() {
      if (queue.isDisposed) return
      clearInterval(tick)
      tokens.stop()
      unsubscribeAccount()
      await queue[Symbol.asyncDispose]()
      run.deps.console.info("Stopped Cashu account sync job.")
      await run[Symbol.asyncDispose]()
    },
  })
}
