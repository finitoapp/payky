import {
  createIdFromString,
  ok,
  sqliteFalse,
  sqliteTrue,
  type Task,
} from "@evolu/common"
import { z } from "zod"

import type { DateDep, EvoluOwnerIdDep } from "@/core/deps.ts"
import { accountByIdQuery } from "@/core/modules/account/account-queries.ts"
import type { AccountId } from "@/core/modules/account/account-types.ts"
import {
  importPayment,
  markPaymentPaidCash,
} from "@/core/modules/payment/payment-actions.ts"
import { paymentByIdQuery } from "@/core/modules/payment/payment-queries.ts"
import type { EvoluDep } from "@/core/modules/shared/evolu-deps.ts"
import { runMutationWithCompletion } from "@/core/modules/shared/evolu-utils.ts"
import {
  type AccountKind,
  NonEmptyStringSchema,
  TimestampMsSchema,
} from "@/core/modules/shared/schema.ts"
import { recordStationContact } from "./station-actions.ts"
import {
  type StationPaymentSnapshot,
  StationPaymentSnapshotJson,
  type StationReportAck,
  type StationToOwnerMessage,
} from "./station-protocol.ts"
import {
  latestStationReportByPaymentIdQuery,
  stationReportIdsQuery,
} from "./station-queries.ts"
import { computeStationReportHash } from "./station-report-utils.ts"
import type { StationId } from "./station-types.ts"

/**
 * Takes in a station's reports (station/0004, station/0005): each whose hash
 * holds and that speaks of this station is stored as received and acked,
 * and the newest report of each payment is projected into the owner's
 * payments. A report that fails a check is dropped unacked. The caller has
 * already checked the station is known and not revoked. Returns the acks.
 */
export const receiveStationReports =
  ({
    stationId,
    message,
  }: {
    readonly stationId: StationId
    readonly message: Extract<
      StationToOwnerMessage,
      { readonly type: "reports" }
    >
  }): Task<
    ReadonlyArray<StationReportAck>,
    never,
    EvoluDep & EvoluOwnerIdDep & DateDep
  > =>
  async (run) => {
    const { evolu, evoluOwnerId } = run.deps
    await run.ok(
      recordStationContact({
        id: stationId,
        configHash: message.configHash,
        lastSeq: message.lastSeq,
      })
    )

    const valid = message.reports.flatMap((report) => {
      if (computeStationReportHash(report) !== report.hash) return []
      const snapshot = z.safeDecode(StationPaymentSnapshotJson, report.payload)
      if (!snapshot.success || snapshot.data.stationId !== stationId) return []
      return [{ ...report, snapshot: snapshot.data }]
    })
    if (valid.length === 0) return ok([])

    const storedIds = new Set(
      (await evolu.loadQuery(stationReportIdsQuery(stationId))).map(
        (row) => row.id
      )
    )
    const receivedAt = TimestampMsSchema.decode(run.deps.date.now().getTime())
    const reports = valid.map((report) => ({
      ...report,
      id: createIdFromString<"StationReport">(
        `stationReport:${stationId}:${report.seq}:${report.hash}`
      ),
    }))
    const fresh = reports.filter((report) => !storedIds.has(report.id))

    if (fresh.length > 0) {
      await runMutationWithCompletion((options) => {
        for (const report of fresh) {
          evolu.upsert(
            "stationReport",
            {
              id: report.id,
              stationId,
              seq: report.seq,
              hash: report.hash,
              prevHash: report.prevHash,
              paymentId: report.snapshot.paymentId,
              stationPaid:
                report.snapshot.settlements.length > 0
                  ? sqliteTrue
                  : sqliteFalse,
              payloadJson: NonEmptyStringSchema.decode(report.payload),
              receivedAt,
            },
            { ...options, ownerId: evoluOwnerId }
          )
        }
      })
    }

    for (const report of fresh) {
      const [latest] = await evolu.loadQuery(
        latestStationReportByPaymentIdQuery(report.snapshot.paymentId)
      )
      if (latest !== undefined && latest.seq > report.seq) continue
      await run.ok(
        projectStationReport({ stationId, snapshot: report.snapshot })
      )
    }

    return ok(reports.map(({ seq, hash }) => ({ seq, hash })))
  }

/**
 * Writes a station's payment into the owner's payments, tagged with the
 * station and employee (station/0009). Only the station's own payment is
 * written: an owner payment of the same id, or another station's, is left
 * alone (station/0005), and a method naming no owner account of its kind is
 * left out. A cash settlement is recorded on the owner from the report; bank
 * and Lightning money only ever from the owner's own sync (station/0006).
 */
export const projectStationReport =
  ({
    stationId,
    snapshot,
  }: {
    readonly stationId: StationId
    readonly snapshot: StationPaymentSnapshot
  }): Task<void, never, EvoluDep & EvoluOwnerIdDep & DateDep> =>
  async (run) => {
    const { evolu } = run.deps
    const [existing] = await evolu.loadQuery(
      paymentByIdQuery(snapshot.paymentId)
    )
    if (existing !== undefined && existing.stationId !== stationId) {
      run.deps.console.warn(
        "[station] A report names a payment the station does not own.",
        { stationId, paymentId: snapshot.paymentId }
      )
      return ok()
    }

    const isOwnAccount = async (
      accountId: AccountId,
      kind: AccountKind
    ): Promise<boolean> => {
      const [account] = await evolu.loadQuery(accountByIdQuery(accountId))
      return account?.kind === kind
    }
    const cash =
      snapshot.cash !== null &&
      (await isOwnAccount(snapshot.cash.accountId, "cashRegister"))
        ? snapshot.cash
        : null
    const iban =
      snapshot.iban !== null &&
      (await isOwnAccount(snapshot.iban.accountId, "iban"))
        ? snapshot.iban
        : null
    const spark =
      snapshot.spark !== null &&
      (await isOwnAccount(snapshot.spark.accountId, "spark"))
        ? snapshot.spark
        : null

    await run.ok(
      importPayment({
        id: snapshot.paymentId,
        stationId,
        employeeId: snapshot.employeeId,
        originCreatedAt: snapshot.createdAt,
        amount: snapshot.amount,
        currency: snapshot.currency,
        tipAmount: snapshot.tipAmount,
        canceledAt: snapshot.canceledAt,
        expiresAt: snapshot.expiresAt,
        number: snapshot.number,
        cashRegister: cash,
        iban,
        spark:
          spark === null
            ? null
            : {
                accountId: spark.accountId,
                amountSats: spark.amountSats,
                exchangeRate: spark.exchangeRate,
                exchangeRateSource: spark.exchangeRateSource,
                exchangeRateFetchedAt: spark.exchangeRateFetchedAt,
                lightning: {
                  lnInvoice: spark.lnInvoice,
                  lightningReceiveRequestId: spark.lightningReceiveRequestId,
                  paymentHash: spark.paymentHash,
                },
              },
      })
    )

    const cashSettlement = snapshot.settlements.find(
      (settlement) => settlement.kind === "cashRegister"
    )
    if (cash !== null && cashSettlement !== undefined) {
      const result = await run(
        markPaymentPaidCash({
          paymentId: snapshot.paymentId,
          accountId: cash.accountId,
          occurredAt: cashSettlement.occurredAt,
          ...(cash.receivedAmount === null
            ? {}
            : { receivedAmount: cash.receivedAmount }),
        })
      )
      if (!result.ok) {
        run.deps.console.warn("[station] Could not record a cash settlement.", {
          paymentId: snapshot.paymentId,
          error: result.error,
        })
      }
    }

    return ok()
  }
