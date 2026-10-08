import { DateIso, ok } from "@evolu/common"
import { subDays } from "date-fns"
import type { Event } from "nostr-tools/pure"
import { z } from "zod"

import type { StationJob } from "@/core/background-jobs/background-job-types.ts"
import { createKeyedTaskQueue } from "@/core/background-jobs/keyed-task-queue.ts"
import {
  unwrapVerifiedRumor,
  watchGiftWraps,
} from "@/core/integrations/nostr/nostr-gift-wrap.ts"
import { deriveNostrSecretKey } from "@/core/modules/shared/key-derivation.ts"
import {
  applyStationConfig,
  applyStationSettlement,
} from "@/core/modules/station/station-config-actions.ts"
import {
  flushStationOutbox,
  markStationReportsAcked,
  STATION_REPORT_WINDOW_DAYS,
  sendStationStatus,
  syncStationOutbox,
} from "@/core/modules/station/station-outbox-actions.ts"
import {
  OwnerToStationMessageJson,
  stationRumorKind,
} from "@/core/modules/station/station-protocol.ts"
import {
  stationPaymentSnapshotsQuery,
  unackedStationOutboxQuery,
} from "@/core/modules/station/station-queries.ts"

/**
 * A PoS station's line to its owner. It takes in what the owner sends —
 * config, acks, settlements, revocation — and from no one else; reports
 * every change to its payments into the outbox and sends what is not yet
 * acknowledged, on every change, every minute and when back online
 * (station/0004); and tells the owner how it stands now and then.
 */
export const createStationCommsJob =
  ({
    flushIntervalMs = 60_000,
    statusIntervalMs = 15 * 60_000,
  }: {
    readonly flushIntervalMs?: number
    readonly statusIntervalMs?: number
  } = {}): StationJob =>
  (run) => {
    const jobRun = run.create({
      ...run.deps,
      console: run.deps.console.child("station-comms-job"),
    })
    const { evolu, date, nostr, stationAccount } = jobRun.deps
    const secretKey = deriveNostrSecretKey(jobRun.deps.masterKey)
    const seenWraps = new Set<string>()
    const queue = createKeyedTaskQueue<
      "sync" | "flush" | "status" | `wrap:${string}`
    >({ onError: (error) => jobRun.deps.onError(error) })

    const sendStatusSoon = (): void =>
      queue.enqueue("status", async () => {
        await jobRun.ok(sendStationStatus())
      })

    const handleWrap = async (wrap: Event): Promise<void> => {
      const rumor = unwrapVerifiedRumor({ wrap, secretKey })
      if (
        rumor === null ||
        rumor.kind !== stationRumorKind ||
        rumor.pubkey !== stationAccount.ownerPubkey
      ) {
        return
      }
      const message = z.safeDecode(OwnerToStationMessageJson, rumor.content)
      if (!message.success) return

      switch (message.data.type) {
        case "config": {
          const applied = await jobRun(applyStationConfig(message.data))
          if (!applied.ok) {
            jobRun.deps.console.warn("Ignored an invalid station config.", {
              error: applied.error,
            })
          }
          sendStatusSoon()
          return
        }
        case "ack":
          await jobRun.ok(markStationReportsAcked(message.data.reports))
          return
        case "settled":
          await jobRun.ok(applyStationSettlement(message.data))
          return
        case "revoked":
          jobRun.deps.console.info("The owner revoked this station.")
          await stationAccount.onRevoked()
          return
      }
    }

    const stopWatching = watchGiftWraps(nostr, {
      secretKey,
      nowSeconds: () => Math.floor(date.now().getTime() / 1000),
      onWrap: (wrap) => {
        if (seenWraps.has(wrap.id)) return
        seenWraps.add(wrap.id)
        queue.enqueue(`wrap:${wrap.id}`, () => handleWrap(wrap))
      },
    })

    const syncSoon = (): void =>
      queue.enqueue("sync", async () => {
        await jobRun.ok(syncStationOutbox())
      })
    const flushSoon = (): void =>
      queue.enqueue("flush", async () => {
        await jobRun.ok(flushStationOutbox())
      })

    const unsubscribePayments = evolu.subscribeQuery(
      stationPaymentSnapshotsQuery({
        createdSince: DateIso.orThrow(
          subDays(date.now(), STATION_REPORT_WINDOW_DAYS).toISOString()
        ),
      })
    )(syncSoon)
    const unsubscribeOutbox = evolu.subscribeQuery(unackedStationOutboxQuery)(
      flushSoon
    )
    const stopOnline = jobRun.deps.connectivity.onOnline(flushSoon)
    const flushTimer = setInterval(flushSoon, flushIntervalMs)
    const statusTimer = setInterval(sendStatusSoon, statusIntervalMs)
    for (const timer of [flushTimer, statusTimer]) {
      ;(timer as { readonly unref?: () => void }).unref?.()
    }

    syncSoon()
    flushSoon()
    sendStatusSoon()

    return ok({
      async [Symbol.asyncDispose]() {
        stopWatching()
        unsubscribePayments()
        unsubscribeOutbox()
        stopOnline()
        clearInterval(flushTimer)
        clearInterval(statusTimer)
        await queue[Symbol.asyncDispose]()
        await jobRun[Symbol.asyncDispose]()
      },
    })
  }

export const startStationCommsJob = createStationCommsJob()
