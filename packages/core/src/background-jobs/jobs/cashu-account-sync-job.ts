import { ok, type Result, type Run, sqliteTrue } from "@evolu/common"
import { cashuAccountQuery } from "../../modules/account/account-queries.ts"
import type { CashuTopupClaimError } from "../../modules/cashu/cashu-errors.ts"
import {
  CLAIMED_ELSEWHERE_GRACE_MS,
  loadCashuAttempts,
} from "../../modules/cashu/cashu-guards.ts"
import { resumeCashuMelt } from "../../modules/cashu/cashu-melt-actions.ts"
import { seedCashuMintIfDue } from "../../modules/cashu/cashu-mint-actions.ts"
import { loadCashuMoveSettlement } from "../../modules/cashu/cashu-move-actions.ts"
import {
  contestedCashuTopupsWithOwnAttemptQuery,
  pendingCashuMeltsQuery,
  pendingCashuTopupsQuery,
} from "../../modules/cashu/cashu-queries.ts"
import {
  type CashuTopupClaim,
  claimCashuTopup,
  reclaimContestedCashuTopup,
} from "../../modules/cashu/cashu-topup-actions.ts"
import type {
  CashuOperationAttemptId,
  CashuOperationId,
} from "../../modules/cashu/cashu-types.ts"
import { reconcileAccountTransaction } from "../../modules/reconciliation-claim/reconciliation-claim-actions.ts"
import { unclaimedCashuTransactionsHeldByPaymentsQuery } from "../../modules/reconciliation-claim/reconciliation-claim-queries.ts"
import { loadCashuWithdrawalSettlement } from "../../modules/withdraw/withdraw-cashu-actions.ts"
import type {
  CashuBackgroundJob,
  CashuBackgroundJobContext,
} from "../background-job-types.ts"
import { createKeyedTaskQueue } from "../keyed-task-queue.ts"
import { createCashuQuoteWatch } from "./cashu-quote-watch.ts"
import { createCashuTokenListener } from "./cashu-token-listener.ts"

/**
 * The Cashu account's sync (cashu/0012): claims the topups of Payky's
 * payments and moves, resumes interrupted melts, and receives tokens. An
 * account enabled before this device synced gets its seed here, once it has
 * (cashu/0013). Each
 * completes with its booking in one batch (cashu/0014). The one thing left
 * to catch up is a booking another device wrote before the payment synced
 * to it, claimed here once both have (cashu/0025). Runs on native and
 * browser while a Cashu account is enabled.
 *
 * Each pending topup is polled on a schedule counted from its creation:
 * every 5 s for 5 minutes, every minute up to an hour, then every 5 minutes.
 * A paid quote is claimed; a claim another device makes is waited for, and
 * taken over at that device's attempt after a grace period when its rows
 * never arrive: reclaimed if it minted, minted if it never did (cashu/0029).
 * A melt another device sent and left is taken over the same way, and
 * settled only once the mint's answer is final (cashu/0027).
 *
 * A mint that pushes a mint quote's state (NUT-17) wakes the job the moment
 * a pending topup's quote reads PAID (`createCashuQuoteWatch`); the poll
 * stays, for every other mint and for a socket that drops.
 */

const TICK_MS = 5_000

const pollIntervalMs = (ageMs: number): number =>
  ageMs < 5 * 60_000 ? 5_000 : ageMs < 60 * 60_000 ? 60_000 : 5 * 60_000

const isCashuAccountEnabled = async (
  run: Run<CashuBackgroundJobContext>
): Promise<boolean> => {
  const [account] = await run.deps.evolu.loadQuery(cashuAccountQuery)
  return account !== undefined && account.isDeleted !== sqliteTrue
}

/**
 * The job's passes over one run, with the state they keep between passes:
 * when each topup was last polled, and since when each claim made elsewhere,
 * contest and pending melt has been seen. A test calls `settle` and
 * `tokens.tick` pass by pass; dropping the object forgets that state, as a
 * restart of the app does.
 */
export const createCashuAccountSync = (run: Run<CashuBackgroundJobContext>) => {
  const lastPolledMs = new Map<CashuOperationId, number>()
  const elsewhereSince = new Map<
    CashuOperationId,
    { readonly attemptId: CashuOperationAttemptId; readonly ms: number }
  >()

  /**
   * Topups whose block is contested, with when this job first saw it: tried
   * again for the grace, then given to no one (cashu/0029). A contest found
   * through a takeover is the same contest on the next pass, so only a claim
   * that settles the topup ends it.
   */
  const contestedSince = new Map<CashuOperationId, number>()
  const settlesContest = (operationId: CashuOperationId): boolean => {
    const since = contestedSince.get(operationId)
    return (
      since !== undefined &&
      run.deps.date.now().getTime() - since >= CLAIMED_ELSEWHERE_GRACE_MS
    )
  }
  const noteContest = (
    operationId: CashuOperationId,
    claim: Result<CashuTopupClaim, CashuTopupClaimError>
  ): void => {
    if (!claim.ok && claim.error.type === "CashuReclaimAmbiguous") {
      if (!contestedSince.has(operationId))
        contestedSince.set(operationId, run.deps.date.now().getTime())
    } else if (claim.ok && claim.value.type !== "claimedElsewhere")
      contestedSince.delete(operationId)
  }

  /**
   * Takes over a claim made elsewhere once its grace period is over, at that
   * device's attempt: reclaimed if it minted, minted if it never did. A newer
   * attempt of that device's starts the grace again.
   */
  const takeOverAfterGrace = async (
    operationId: CashuOperationId,
    attemptId: CashuOperationAttemptId | null
  ): Promise<void> => {
    if (attemptId === null) return
    const nowMs = run.deps.date.now().getTime()
    const seen = elsewhereSince.get(operationId)
    const since = seen?.attemptId === attemptId ? seen.ms : nowMs
    elsewhereSince.set(operationId, { attemptId, ms: since })
    if (nowMs - since < CLAIMED_ELSEWHERE_GRACE_MS) return
    const claim = await run(
      claimCashuTopup(operationId, {
        takeOver: attemptId,
        settleContest: settlesContest(operationId),
      })
    )
    noteContest(operationId, claim)
    if (!claim.ok || claim.value.type !== "claimed") return
    elsewhereSince.delete(operationId)
    run.deps.console.info("Took over a Cashu topup claimed elsewhere.", {
      operationId,
    })
  }

  const claimTopup = async (operationId: CashuOperationId): Promise<void> => {
    const claim = await run(
      claimCashuTopup(operationId, {
        settleContest: settlesContest(operationId),
      })
    )
    noteContest(operationId, claim)
    if (!claim.ok) {
      run.deps.console.warn("Cashu topup claim failed.", {
        operationId,
        error: claim.error,
      })
      return
    }
    if (claim.value.type === "claimedElsewhere")
      await takeOverAfterGrace(operationId, claim.value.attemptId)
    else elsewhereSince.delete(operationId)
  }

  /**
   * Pending melts, with when this job first saw each: another device's is
   * left to it for the grace, and a melt whose quote states no expiry is
   * fenced a grace after it was first seen, never by the sender's clock
   * alone (cashu/0027).
   */
  const meltSeenSince = new Map<CashuOperationId, number>()
  /**
   * Melts whose block is contested, with when this job first saw it: given
   * to no one past the grace, so no melt waits on a contest for good
   * (cashu/0029).
   */
  const meltContestedSince = new Map<CashuOperationId, number>()
  /** When each pending melt was last resumed, for its backoff. */
  const meltResumedMs = new Map<CashuOperationId, number>()

  /**
   * Interrupted melts (a withdrawal, a move's source), each settled with its
   * owner's rows in one batch (cashu/0014). This device's own are resumed at
   * once; one another device sent is taken over past the grace. Either is
   * settled only on an answer no request still on its way can change
   * (cashu/0027).
   */
  const resumeMelts = async (): Promise<void> => {
    const melts = await run.deps.evolu.loadQuery(pendingCashuMeltsQuery)
    const nowMs = run.deps.date.now().getTime()
    for (const { id, createdAt } of melts) {
      const since = meltSeenSince.get(id) ?? nowMs
      meltSeenSince.set(id, since)
      // A melt pending for long is asked less often, as a topup is: each
      // resume costs several mint requests.
      const ageMs = nowMs - Math.min(since, Date.parse(createdAt))
      const last = meltResumedMs.get(id)
      if (last !== undefined && nowMs - last < pollIntervalMs(ageMs)) continue
      const attempts = await run.ok(loadCashuAttempts(id))
      if (
        !attempts.some((attempt) => attempt.own) &&
        nowMs - since < CLAIMED_ELSEWHERE_GRACE_MS
      )
        continue
      meltResumedMs.set(id, nowMs)
      // Sent here, or only fenced here once taken over (cashu/0027).
      const sentHere = attempts.some(
        (attempt) => attempt.own && !attempt.ownFence
      )
      const settlement =
        (await run.ok(loadCashuWithdrawalSettlement(id))) ??
        (await run.ok(loadCashuMoveSettlement(id))) ??
        undefined
      const contested = meltContestedSince.get(id)
      const resumed = await run(
        resumeCashuMelt(id, settlement, {
          takeOver: !sentHere,
          pendingSinceMs: since,
          // A melt this device is sending holds the lock; topups wait on
          // this pass, not on its Lightning payment.
          skipIfBusy: true,
          settleContest:
            contested !== undefined &&
            nowMs - contested >= CLAIMED_ELSEWHERE_GRACE_MS,
        })
      )
      if (!resumed.ok && resumed.error.type === "CashuReclaimAmbiguous")
        meltContestedSince.set(id, contested ?? nowMs)
      else if (resumed.ok) meltContestedSince.delete(id)
      if (resumed.ok && resumed.value.type !== "pending") {
        meltSeenSince.delete(id)
        meltResumedMs.delete(id)
      }
    }
  }

  /**
   * Bookings written on a device the payment holding them had not synced to,
   * claimed for that payment once both are here (cashu/0025).
   */
  const claimHeldBookings = async (): Promise<void> => {
    const rows = await run.deps.evolu.loadQuery(
      unclaimedCashuTransactionsHeldByPaymentsQuery
    )
    for (const { id } of rows) await run.ok(reconcileAccountTransaction(id))
  }

  /**
   * Topups another device closed as contested while this device's claim was
   * on its way, each reclaimed at this device's own blocks once per run of
   * the job (cashu/0029).
   */
  const reclaimedContested = new Set<CashuOperationId>()
  const reclaimContestedTopups = async (): Promise<void> => {
    const rows = await run.deps.evolu.loadQuery(
      contestedCashuTopupsWithOwnAttemptQuery
    )
    for (const { id } of rows) {
      if (reclaimedContested.has(id)) continue
      const reclaimed = await run(reclaimContestedCashuTopup(id))
      if (!reclaimed.ok) continue
      reclaimedContested.add(id)
      if (reclaimed.value > 0)
        run.deps.console.info("Reclaimed a Cashu topup closed as contested.", {
          operationId: id,
        })
    }
  }

  const settle = async (): Promise<void> => {
    if (!(await isCashuAccountEnabled(run))) return
    // Enabled before this device synced: seeded once it has, unless the
    // merchant's mints arrived meanwhile (cashu/0013).
    if (await run.ok(seedCashuMintIfDue))
      run.deps.console.info("Seeded the default Cashu mint.")
    await claimHeldBookings()
    await resumeMelts()
    const nowMs = run.deps.date.now().getTime()
    const topups = await run.deps.evolu.loadQuery(pendingCashuTopupsQuery)
    const due = topups.filter((topup) => {
      const ageMs = nowMs - Date.parse(topup.createdAt)
      const last = lastPolledMs.get(topup.id) ?? 0
      return nowMs - last >= pollIntervalMs(ageMs)
    })
    for (const topup of due) {
      lastPolledMs.set(topup.id, nowMs)
      await claimTopup(topup.id)
    }
    await reclaimContestedTopups()
  }

  return {
    /**
     * One pass over the account: held bookings, melts, the topups due for a
     * poll, and contested topups with a block of this device's.
     */
    settle,
    /** The next pass polls this topup, however recently it was polled. */
    pollNow: (topupId: CashuOperationId): void => {
      lastPolledMs.delete(topupId)
    },
    // Tokens over NIP-17: listened for whenever the Cashu account is enabled,
    // not only while a payment waits (cashu/0030).
    tokens: createCashuTokenListener(run),
  }
}

/**
 * The Cashu job, passing over the account every `tickMs` besides whenever
 * the account or a watched quote changes. Tests shorten the tick.
 */
export const createCashuAccountSyncJob =
  ({
    tickMs = TICK_MS,
  }: {
    readonly tickMs?: number
  } = {}): CashuBackgroundJob =>
  (taskRun) => {
    // A fresh scope: the Task's own run is disposed as soon as it returns, but
    // the timers below keep composing Tasks for as long as the job runs.
    const run = taskRun.create({
      ...taskRun.deps,
      console: taskRun.deps.console.child("cashu-account-sync-job"),
    })
    const queue = createKeyedTaskQueue<"topups" | "tokens">({
      onError: (error) => run.deps.onError(error),
    })
    const { settle, pollNow, tokens } = createCashuAccountSync(run)
    const isEnabled = () => isCashuAccountEnabled(run)

    // Checked again here: a tick queued before the account was disabled must
    // not run ahead of `followAccount` stopping the listener.
    const tokensSoon = () =>
      queue.enqueue("tokens", async () => {
        if (await isEnabled()) await tokens.tick()
      })
    const followAccount = async (): Promise<void> => {
      if (await isEnabled()) await tokens.start(tokensSoon)
      else tokens.stop()
    }

    const settleSoon = () => {
      queue.enqueue("topups", async () => {
        await settle()
        if (await isEnabled()) await quotes.refresh()
        else quotes.clear()
      })
      tokensSoon()
    }
    const quotes = createCashuQuoteWatch(run, (topupId) => {
      pollNow(topupId)
      settleSoon()
    })
    const unsubscribeAccount = run.deps.evolu.subscribeQuery(cashuAccountQuery)(
      () => {
        void followAccount()
        settleSoon()
      }
    )
    const tick = setInterval(settleSoon, tickMs)
    ;(tick as { readonly unref?: () => void }).unref?.()

    run.deps.console.info("Started Cashu account sync job.")
    void followAccount()
    settleSoon()

    return ok({
      async [Symbol.asyncDispose]() {
        if (queue.isDisposed) return
        clearInterval(tick)
        tokens.stop()
        quotes.stop()
        unsubscribeAccount()
        await queue[Symbol.asyncDispose]()
        run.deps.console.info("Stopped Cashu account sync job.")
        await run[Symbol.asyncDispose]()
      },
    })
  }

export const startCashuAccountSyncJob: CashuBackgroundJob =
  createCashuAccountSyncJob()
