import {
  createIdFromString,
  DateIso,
  type LockManagerDep,
  ok,
  type Task,
} from "@evolu/common"
import { subDays } from "date-fns"

import type {
  DateDep,
  EvoluOwnerIdDep,
  MasterKeyDep,
  StationAccountDep,
} from "@/core/deps.ts"
import type { NostrDep } from "@/core/integrations/nostr/nostr-client.ts"
import {
  createGiftWrap,
  publishGiftWrap,
} from "@/core/integrations/nostr/nostr-gift-wrap.ts"
import type { PaymentId } from "@/core/modules/payment/payment-types.ts"
import type { EvoluDep } from "@/core/modules/shared/evolu-deps.ts"
import { runMutationWithCompletion } from "@/core/modules/shared/evolu-utils.ts"
import { deriveNostrSecretKey } from "@/core/modules/shared/key-derivation.ts"
import {
  NonEmptyStringSchema,
  NonNegativeInteger,
  PositiveInteger,
  type Sha256Hex,
  TimestampMsSchema,
} from "@/core/modules/shared/schema.ts"
import {
  encodeStationMessage,
  MAX_REPORTS_PER_MESSAGE,
  type StationReportAck,
  stationRumorKind,
} from "./station-protocol.ts"
import {
  lastStationOutboxQuery,
  stationConfigQuery,
  stationPaymentSnapshotsQuery,
  unackedStationOutboxQuery,
} from "./station-queries.ts"
import {
  buildStationPaymentSnapshot,
  computeStationReportHash,
  genesisReportHash,
} from "./station-report-utils.ts"

/** How far back a station looks for payments whose report may change. */
export const STATION_REPORT_WINDOW_DAYS = 7

/** How long a report a relay accepted waits for its ack before resending. */
const RESEND_AFTER_MS = 5 * 60_000

/**
 * Appends a report for every station payment whose snapshot differs from
 * the last one reported, chained to the report before it (station/0004).
 * Seqs are handed out under a lock, so two tabs never write the same one.
 * Without `paymentIds` it looks at the payments of the last week.
 */
export const syncStationOutbox =
  ({
    paymentIds,
  }: {
    readonly paymentIds?: ReadonlyArray<PaymentId>
  } = {}): Task<
    number,
    never,
    EvoluDep & EvoluOwnerIdDep & DateDep & LockManagerDep
  > =>
  async (run) => {
    const { evolu, date, evoluOwnerId } = run.deps
    const filter =
      paymentIds === undefined
        ? {
            createdSince: DateIso.orThrow(
              subDays(date.now(), STATION_REPORT_WINDOW_DAYS).toISOString()
            ),
          }
        : { paymentIds }

    const appended = await run.deps.lockManager.request(
      "station-outbox",
      async () => {
        const [rows, [last]] = await Promise.all([
          evolu.loadQuery(stationPaymentSnapshotsQuery(filter)),
          evolu.loadQuery(lastStationOutboxQuery),
        ])
        const changed = rows.flatMap((row) => {
          const payload = buildStationPaymentSnapshot(row)
          return payload === row.lastReportedPayload
            ? []
            : [{ paymentId: row.id, payload }]
        })
        if (changed.length === 0) return 0

        let seq: number = last?.seq ?? 0
        let prevHash: Sha256Hex = last?.hash ?? genesisReportHash
        const reports = changed.map(({ paymentId, payload }) => {
          seq += 1
          const hash = computeStationReportHash({ seq, prevHash, payload })
          const report = {
            id: createIdFromString<"StationOutbox">(`stationOutbox:${seq}`),
            seq: PositiveInteger(seq),
            prevHash,
            hash,
            paymentId,
            payloadJson: NonEmptyStringSchema.decode(payload),
          }
          prevHash = hash
          return report
        })

        await runMutationWithCompletion((options) => {
          for (const report of reports) {
            evolu.upsert("stationOutbox", report, {
              ...options,
              ownerId: evoluOwnerId,
            })
          }
        })
        return reports.length
      }
    )

    return ok(appended)
  }

/**
 * Sends the owner every report it has not acknowledged and no relay took in
 * the last five minutes, a few per message. A report counts as sent only
 * once a relay accepted it. Returns how many were sent.
 */
export const flushStationOutbox =
  (): Task<
    number,
    never,
    EvoluDep &
      EvoluOwnerIdDep &
      DateDep &
      NostrDep &
      MasterKeyDep &
      StationAccountDep
  > =>
  async (run) => {
    const { evolu, date, evoluOwnerId } = run.deps
    const now = date.now().getTime()
    const [unacked, [config], [last]] = await Promise.all([
      evolu.loadQuery(unackedStationOutboxQuery),
      evolu.loadQuery(stationConfigQuery),
      evolu.loadQuery(lastStationOutboxQuery),
    ])
    const due = unacked.filter(
      (row) => row.sentAt === null || now - row.sentAt > RESEND_AFTER_MS
    )
    if (due.length === 0) return ok(0)

    const secretKey = deriveNostrSecretKey(run.deps.masterKey)
    const ownerPubkey = run.deps.stationAccount.ownerPubkey
    const sent: Array<(typeof due)[number]> = []
    for (let start = 0; start < due.length; start += MAX_REPORTS_PER_MESSAGE) {
      const chunk = due.slice(start, start + MAX_REPORTS_PER_MESSAGE)
      const accepted = await publishGiftWrap(
        run.deps.nostr,
        createGiftWrap({
          kind: stationRumorKind,
          content: encodeStationMessage({
            v: 1,
            type: "reports",
            configHash: config?.hash ?? null,
            lastSeq: NonNegativeInteger(last?.seq ?? 0),
            reports: chunk.map((row) => ({
              seq: row.seq,
              prevHash: row.prevHash,
              hash: row.hash,
              payload: row.payloadJson,
            })),
          }),
          tags: [["p", ownerPubkey]],
          senderSecretKey: secretKey,
          recipientPubkey: ownerPubkey,
          createdAt: Math.floor(now / 1000),
        }),
        secretKey
      )
      // Relays down: the rest would fail the same way.
      if (!accepted) break
      sent.push(...chunk)
    }

    if (sent.length > 0) {
      await runMutationWithCompletion((options) => {
        for (const row of sent) {
          evolu.update(
            "stationOutbox",
            { id: row.id, sentAt: TimestampMsSchema.decode(now) },
            { ...options, ownerId: evoluOwnerId }
          )
        }
      })
    }
    return ok(sent.length)
  }

/**
 * Marks reports the owner acknowledged. An ack counts only for the exact
 * report sent: a seq with another hash leaves the report to be resent.
 */
export const markStationReportsAcked =
  (
    acks: ReadonlyArray<StationReportAck>
  ): Task<number, never, EvoluDep & EvoluOwnerIdDep & DateDep> =>
  async (run) => {
    const { evolu, evoluOwnerId } = run.deps
    const unacked = await evolu.loadQuery(unackedStationOutboxQuery)
    const acked = unacked.filter((row) =>
      acks.some((ack) => ack.seq === row.seq && ack.hash === row.hash)
    )
    if (acked.length === 0) return ok(0)

    const ackedAt = TimestampMsSchema.decode(run.deps.date.now().getTime())
    await runMutationWithCompletion((options) => {
      for (const row of acked) {
        evolu.update(
          "stationOutbox",
          { id: row.id, ackedAt },
          { ...options, ownerId: evoluOwnerId }
        )
      }
    })
    return ok(acked.length)
  }

/**
 * Tells the owner how the station stands: the config it applies, its
 * newest report and how many wait for an ack. Whether a relay took it.
 */
export const sendStationStatus =
  (): Task<
    boolean,
    never,
    EvoluDep & DateDep & NostrDep & MasterKeyDep & StationAccountDep
  > =>
  async (run) => {
    const { evolu } = run.deps
    const [[config], [last], unacked] = await Promise.all([
      evolu.loadQuery(stationConfigQuery),
      evolu.loadQuery(lastStationOutboxQuery),
      evolu.loadQuery(unackedStationOutboxQuery),
    ])
    const secretKey = deriveNostrSecretKey(run.deps.masterKey)
    const ownerPubkey = run.deps.stationAccount.ownerPubkey

    return ok(
      await publishGiftWrap(
        run.deps.nostr,
        createGiftWrap({
          kind: stationRumorKind,
          content: encodeStationMessage({
            v: 1,
            type: "status",
            configHash: config?.hash ?? null,
            lastSeq: NonNegativeInteger(last?.seq ?? 0),
            undeliveredCount: NonNegativeInteger(unacked.length),
          }),
          tags: [["p", ownerPubkey]],
          senderSecretKey: secretKey,
          recipientPubkey: ownerPubkey,
          createdAt: Math.floor(run.deps.date.now().getTime() / 1000),
        }),
        secretKey
      )
    )
  }
