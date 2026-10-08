import { ok } from "@evolu/common"
import type { Event } from "nostr-tools/pure"
import { z } from "zod"

import type { OwnerStationJob } from "@/core/background-jobs/background-job-types.ts"
import { createKeyedTaskQueue } from "@/core/background-jobs/keyed-task-queue.ts"
import {
  createGiftWrap,
  publishGiftWrap,
  unwrapVerifiedRumor,
  watchGiftWraps,
} from "@/core/integrations/nostr/nostr-gift-wrap.ts"
import {
  cashRegisterAccountQuery,
  fiatBankAccountQuery,
  sparkAccountQuery,
} from "@/core/modules/account/account-queries.ts"
import { settingsQuery } from "@/core/modules/app-settings/app-settings-queries.ts"
import { activeEmployeesQuery } from "@/core/modules/employee/employee-queries.ts"
import {
  deriveStationCommsSecretKey,
  type SparkSecret,
} from "@/core/modules/shared/key-derivation.ts"
import {
  type SparkIdentityPubkey,
  SparkIdentityPubkeySchema,
} from "@/core/modules/shared/schema.ts"
import {
  recordStationContact,
  setStationConfigHash,
} from "@/core/modules/station/station-actions.ts"
import {
  buildStationConfig,
  serializeStationConfig,
} from "@/core/modules/station/station-config-utils.ts"
import {
  encodeStationMessage,
  type OwnerToStationMessage,
  StationToOwnerMessageJson,
  stationRumorKind,
} from "@/core/modules/station/station-protocol.ts"
import {
  type StationListRow,
  stationSettlementNoticesQuery,
  stationsQuery,
} from "@/core/modules/station/station-queries.ts"
import { receiveStationReports } from "@/core/modules/station/station-report-actions.ts"

const MINUTE_MS = 60_000

/**
 * The owner's line to its PoS stations, under its comms key (station/0002).
 * It listens while any station exists, takes reports only from a known,
 * unrevoked station (station/0005) and acks them; keeps every station's
 * config current and resends it until the station applies it
 * (station/0008); tells stations what the owner settled (station/0012); and
 * tells a revoked station so.
 */
export const createOwnerStationJob =
  ({
    configResendMs = 10 * MINUTE_MS,
    tickIntervalMs = MINUTE_MS,
  }: {
    readonly configResendMs?: number
    readonly tickIntervalMs?: number
  } = {}): OwnerStationJob =>
  (run) => {
    const jobRun = run.create({
      ...run.deps,
      console: run.deps.console.child("owner-station-job"),
    })
    const { evolu, date, nostr } = jobRun.deps
    const commsKey = deriveStationCommsSecretKey(jobRun.deps.masterKey)
    const queue = createKeyedTaskQueue<
      "stations" | "configs" | "settled" | `wrap:${string}`
    >({ onError: (error) => jobRun.deps.onError(error) })
    const seenWraps = new Set<string>()
    const lastSent = new Map<string, { at: number; hash?: string }>()
    const receiverBySecret = new Map<string, SparkIdentityPubkey>()
    let stations: ReadonlyArray<StationListRow> = []
    let stopWatching: (() => void) | undefined

    const send = async (
      station: StationListRow,
      message:
        | OwnerToStationMessage
        | { readonly v: 1; readonly type: "revoked" }
    ): Promise<boolean> =>
      publishGiftWrap(
        nostr,
        createGiftWrap({
          kind: stationRumorKind,
          content: encodeStationMessage(message),
          tags: [["p", station.nostrPubkey]],
          senderSecretKey: commsKey,
          recipientPubkey: station.nostrPubkey,
          createdAt: Math.floor(date.now().getTime() / 1000),
        }),
        commsKey
      )

    /** Sends unless the same thing went out less than `intervalMs` ago. */
    const sendThrottled = async ({
      key,
      hash,
      intervalMs,
      station,
      message,
    }: {
      readonly key: string
      readonly hash?: string
      readonly intervalMs: number
      readonly station: StationListRow
      readonly message: Parameters<typeof send>[1]
    }): Promise<void> => {
      const now = date.now().getTime()
      const previous = lastSent.get(key)
      if (
        previous !== undefined &&
        previous.hash === hash &&
        now - previous.at < intervalMs
      ) {
        return
      }
      if (await send(station, message)) lastSent.set(key, { at: now, hash })
    }

    const loadReceiverPubkey = async (
      secret: SparkSecret
    ): Promise<SparkIdentityPubkey | null> => {
      const cached = receiverBySecret.get(secret)
      if (cached !== undefined) return cached
      try {
        await using wallet = await jobRun.deps.sparkSyncWallet.create(secret)
        const parsed = SparkIdentityPubkeySchema.safeParse(
          await wallet.getIdentityPublicKey()
        )
        if (!parsed.success) return null
        receiverBySecret.set(secret, parsed.data)
        return parsed.data
      } catch (error) {
        jobRun.deps.console.warn("Could not read the Spark identity key.", {
          error,
        })
        return null
      }
    }

    const refreshConfigs = async (urgentStationId?: string): Promise<void> => {
      const [[settings], employees, [cash], [iban], [spark], rows] =
        await Promise.all([
          evolu.loadQuery(settingsQuery),
          evolu.loadQuery(activeEmployeesQuery),
          evolu.loadQuery(cashRegisterAccountQuery),
          evolu.loadQuery(fiatBankAccountQuery),
          evolu.loadQuery(sparkAccountQuery),
          evolu.loadQuery(stationsQuery),
        ])
      const active = rows.filter((station) => station.revokedAt === null)
      if (settings === undefined || active.length === 0) return

      const liveSpark = spark !== undefined && spark.isDeleted !== 1
      const receiverIdentityPubkey = liveSpark
        ? await loadReceiverPubkey(spark.secret)
        : null
      // Without the key a config would drop Lightning from every station;
      // the next tick tries again.
      if (liveSpark && receiverIdentityPubkey === null) return

      for (const station of active) {
        const { configJson, hash } = serializeStationConfig(
          buildStationConfig({
            station,
            settings,
            employees,
            cash: cash === undefined || cash.isDeleted === 1 ? null : cash,
            iban:
              iban === undefined || iban.isDeleted === 1
                ? null
                : { ...iban, defaultQrFormat: iban.defaultQrFormat ?? "spayd" },
            spark:
              liveSpark && receiverIdentityPubkey !== null
                ? { id: spark.id, receiverIdentityPubkey }
                : null,
          })
        )
        const version = await jobRun.ok(
          setStationConfigHash({ id: station.id, hash })
        )
        if (station.ackedConfigHash === hash) continue

        await sendThrottled({
          key: `config:${station.id}`,
          hash,
          intervalMs:
            urgentStationId === station.id ? MINUTE_MS : configResendMs,
          station,
          message: {
            v: 1,
            type: "config",
            version,
            hash,
            configJson,
          },
        })
      }
    }

    const sendSettlementNotices = async (): Promise<void> => {
      const notices = await evolu.loadQuery(stationSettlementNoticesQuery)
      for (const notice of notices) {
        const station = stations.find(
          (candidate) =>
            candidate.id === notice.stationId && candidate.revokedAt === null
        )
        if (station === undefined) continue
        await sendThrottled({
          key: `settled:${notice.paymentId}`,
          intervalMs: 5 * MINUTE_MS,
          station,
          message: {
            v: 1,
            type: "settled",
            paymentId: notice.paymentId,
            method: notice.kind === "iban" ? "iban" : "spark",
            occurredAt: notice.occurredAt,
            sparkTransferId: notice.sparkTransferId,
          },
        })
      }
    }

    const handleWrap = async (wrap: Event): Promise<void> => {
      const rumor = unwrapVerifiedRumor({ wrap, secretKey: commsKey })
      if (rumor === null || rumor.kind !== stationRumorKind) return
      const station = stations.find(
        (candidate) => candidate.nostrPubkey === rumor.pubkey
      )
      if (station === undefined) {
        jobRun.deps.console.debug("Ignored a message from an unknown station.")
        return
      }
      if (station.revokedAt !== null) {
        await sendThrottled({
          key: `revoked:${station.id}`,
          intervalMs: 10 * MINUTE_MS,
          station,
          message: { v: 1, type: "revoked" },
        })
        return
      }
      const message = z.safeDecode(StationToOwnerMessageJson, rumor.content)
      if (!message.success) return

      if (message.data.type === "reports") {
        const acks = await jobRun.ok(
          receiveStationReports({
            stationId: station.id,
            message: message.data,
          })
        )
        if (acks.length > 0) {
          await send(station, { v: 1, type: "ack", reports: [...acks] })
        }
      } else {
        await jobRun.ok(
          recordStationContact({
            id: station.id,
            configHash: message.data.configHash,
            lastSeq: message.data.lastSeq,
          })
        )
      }
      queue.enqueue("configs", () => refreshConfigs(station.id))
    }

    const refreshStations = async (): Promise<void> => {
      stations = await evolu.loadQuery(stationsQuery)
      if (stations.length > 0 && stopWatching === undefined) {
        stopWatching = watchGiftWraps(nostr, {
          secretKey: commsKey,
          nowSeconds: () => Math.floor(date.now().getTime() / 1000),
          onWrap: (wrap) => {
            if (seenWraps.has(wrap.id)) return
            seenWraps.add(wrap.id)
            queue.enqueue(`wrap:${wrap.id}`, () => handleWrap(wrap))
          },
        })
      }
      if (stations.length === 0 && stopWatching !== undefined) {
        stopWatching()
        stopWatching = undefined
      }
      for (const station of stations) {
        if (station.revokedAt === null) continue
        await sendThrottled({
          key: `revoked:${station.id}`,
          intervalMs: Number.POSITIVE_INFINITY,
          station,
          message: { v: 1, type: "revoked" },
        })
      }
      queue.enqueue("configs", () => refreshConfigs())
    }

    const refreshStationsSoon = (): void =>
      queue.enqueue("stations", refreshStations)
    const refreshConfigsSoon = (): void =>
      queue.enqueue("configs", () => refreshConfigs())
    const sendSettlementNoticesSoon = (): void =>
      queue.enqueue("settled", sendSettlementNotices)

    const unsubscribes = [
      evolu.subscribeQuery(stationsQuery)(refreshStationsSoon),
      ...[
        settingsQuery,
        activeEmployeesQuery,
        cashRegisterAccountQuery,
        fiatBankAccountQuery,
        sparkAccountQuery,
      ].map((query) => evolu.subscribeQuery(query)(refreshConfigsSoon)),
      evolu.subscribeQuery(stationSettlementNoticesQuery)(
        sendSettlementNoticesSoon
      ),
    ]
    const timer = setInterval(() => {
      refreshConfigsSoon()
      sendSettlementNoticesSoon()
    }, tickIntervalMs)
    ;(timer as { readonly unref?: () => void }).unref?.()
    refreshStationsSoon()
    sendSettlementNoticesSoon()

    return ok({
      async [Symbol.asyncDispose]() {
        clearInterval(timer)
        for (const unsubscribe of unsubscribes) unsubscribe()
        stopWatching?.()
        await queue[Symbol.asyncDispose]()
        await jobRun[Symbol.asyncDispose]()
      },
    })
  }

export const startOwnerStationJob = createOwnerStationJob()
