import { sha256 } from "@noble/hashes/sha2.js"
import { bytesToHex } from "@noble/hashes/utils.js"

import type { EmployeeId } from "@/core/modules/employee/employee-types.ts"
import { derivePaymentStatus } from "@/core/modules/payment/payment-status-utils.ts"
import {
  type FiatCurrency,
  Sha256Hex,
  type TimestampMs,
} from "@/core/modules/shared/schema.ts"
import {
  StationPaymentMethodSchema,
  type StationPaymentSnapshot,
  type StationSettlement,
} from "./station-protocol.ts"
import type {
  StationPaymentInRangeRow,
  StationPaymentSnapshotRow,
} from "./station-queries.ts"
import type { StationId } from "./station-types.ts"

export const sha256Hex = (text: string): Sha256Hex =>
  Sha256Hex(bytesToHex(sha256(new TextEncoder().encode(text))))

/** What the first report links to. */
export const genesisReportHash = Sha256Hex("0".repeat(64))

/**
 * A report's hash covers its seq, the hash it links to and its payload as
 * the exact string sent, so the owner checks it with no canonicalization
 * (station/0004).
 */
export const computeStationReportHash = ({
  seq,
  prevHash,
  payload,
}: {
  readonly seq: number
  readonly prevHash: Sha256Hex
  readonly payload: string
}): Sha256Hex => sha256Hex(`${seq}\n${prevHash}\n${payload}`)

const compareSettlements = (
  a: StationSettlement,
  b: StationSettlement
): number =>
  a.kind.localeCompare(b.kind) ||
  a.occurredAt - b.occurredAt ||
  (a.sparkTransferId ?? "").localeCompare(b.sparkTransferId ?? "")

/**
 * The report payload for one payment, in a fixed key order so an unchanged
 * payment yields the same string and is not reported again.
 */
export const buildStationPaymentSnapshot = (
  row: StationPaymentSnapshotRow
): string => {
  const settlements = row.settlements
    .flatMap((settlement): ReadonlyArray<StationSettlement> => {
      const kind = StationPaymentMethodSchema.safeParse(settlement.kind)
      return kind.success
        ? [
            {
              kind: kind.data,
              amount: settlement.amount,
              currency: settlement.currency,
              occurredAt: settlement.occurredAt,
              sparkTransferId: settlement.sparkTransferId,
              preimage: settlement.preImage,
            },
          ]
        : []
    })
    .toSorted(compareSettlements)

  const snapshot: StationPaymentSnapshot = {
    paymentId: row.id,
    stationId: row.stationId,
    employeeId: row.employeeId,
    createdAt: Date.parse(row.createdAt) as TimestampMs,
    amount: row.amount,
    currency: row.currency,
    tipAmount: row.tipAmount,
    canceledAt: row.canceledAt,
    expiresAt: row.expiresAt,
    number:
      row.serialNumber === null
        ? null
        : { serialNumber: row.serialNumber, date: row.numberDate },
    cash:
      row.cashAccountId === null
        ? null
        : {
            accountId: row.cashAccountId,
            receivedAmount: row.cashReceivedAmount,
          },
    iban:
      row.ibanAccountId === null
        ? null
        : {
            accountId: row.ibanAccountId,
            variableSymbol: row.variableSymbol,
            specificSymbol: row.specificSymbol,
          },
    spark:
      row.sparkAccountId === null ||
      row.amountSats === null ||
      row.exchangeRate === null ||
      row.exchangeRateSource === null ||
      row.exchangeRateFetchedAt === null ||
      row.lnInvoice === null
        ? null
        : {
            accountId: row.sparkAccountId,
            amountSats: row.amountSats,
            exchangeRate: row.exchangeRate,
            exchangeRateSource: row.exchangeRateSource,
            exchangeRateFetchedAt: row.exchangeRateFetchedAt,
            lnInvoice: row.lnInvoice,
            lightningReceiveRequestId: row.lightningReceiveRequestId,
            paymentHash: row.paymentHash,
          },
    settlements,
  }

  return JSON.stringify(snapshot)
}

export interface StationReportChainAnalysis {
  readonly lastReceivedSeq: number
  /** Seqs neither received nor yet known not to exist, as inclusive ranges. */
  readonly missingRanges: ReadonlyArray<{
    readonly from: number
    readonly to: number
  }>
  /** Seqs whose `prevHash` is not the hash of the report before them. */
  readonly brokenLinkSeqs: ReadonlyArray<number>
  /** Seqs received with two different hashes: a forked station. */
  readonly conflictSeqs: ReadonlyArray<number>
}

/**
 * What is wrong with a station's chain of reports (station/0004): the gaps
 * up to the newest seq it said it has, the links that do not match and the
 * seqs it sent twice with different content.
 */
export const analyzeStationReportChain = (
  rows: ReadonlyArray<{
    readonly seq: number
    readonly hash: string
    readonly prevHash: string
  }>,
  reportedLastSeq: number | null
): StationReportChainAnalysis => {
  const hashesBySeq = new Map<number, Set<string>>()
  const prevHashBySeq = new Map<number, string>()
  for (const row of rows) {
    const hashes = hashesBySeq.get(row.seq) ?? new Set<string>()
    hashes.add(row.hash)
    hashesBySeq.set(row.seq, hashes)
    prevHashBySeq.set(row.seq, row.prevHash)
  }

  const lastReceivedSeq = Math.max(0, ...hashesBySeq.keys())
  const lastSeq = Math.max(lastReceivedSeq, reportedLastSeq ?? 0)

  const missingRanges: Array<{ from: number; to: number }> = []
  const brokenLinkSeqs: number[] = []
  const conflictSeqs: number[] = []

  for (let seq = 1; seq <= lastSeq; seq++) {
    const hashes = hashesBySeq.get(seq)
    if (hashes === undefined) {
      const current = missingRanges.at(-1)
      if (current !== undefined && current.to === seq - 1) current.to = seq
      else missingRanges.push({ from: seq, to: seq })
      continue
    }
    if (hashes.size > 1) {
      conflictSeqs.push(seq)
      continue
    }

    const previous =
      seq === 1 ? new Set([genesisReportHash]) : hashesBySeq.get(seq - 1)
    const prevHash = prevHashBySeq.get(seq)
    if (
      previous !== undefined &&
      previous.size === 1 &&
      prevHash !== undefined &&
      !previous.has(prevHash)
    ) {
      brokenLinkSeqs.push(seq)
    }
  }

  return { lastReceivedSeq, missingRanges, brokenLinkSeqs, conflictSeqs }
}

export interface StationPaymentTotals {
  readonly count: number
  readonly amount: number
  readonly tips: number
}

export interface StationPaymentSummary {
  readonly stationId: StationId
  readonly totals: ReadonlyArray<
    StationPaymentTotals & { readonly currency: FiatCurrency }
  >
  readonly byEmployee: ReadonlyArray<
    StationPaymentTotals & {
      readonly employeeId: EmployeeId | null
      readonly employeeName: string | null
      readonly currency: FiatCurrency
    }
  >
  /** Payments the station reported paid that the owner holds no money for. */
  readonly reportedPaidUnconfirmed: number
}

const addPayment = (
  totals: StationPaymentTotals | undefined,
  row: StationPaymentInRangeRow
): StationPaymentTotals => ({
  count: (totals?.count ?? 0) + 1,
  amount: (totals?.amount ?? 0) + row.amount,
  tips: (totals?.tips ?? 0) + row.tipAmount,
})

/**
 * The paid totals of each station, per currency and per employee. Paid is
 * what the owner holds money for, as `derivePaymentStatus` reads it.
 */
export const summarizeStationPayments = (
  rows: ReadonlyArray<StationPaymentInRangeRow>,
  now: Date
): ReadonlyArray<StationPaymentSummary> => {
  const stationIds = [...new Set(rows.map((row) => row.stationId))]

  return stationIds.map((stationId) => {
    const stationRows = rows.filter((row) => row.stationId === stationId)
    const paidRows = stationRows.filter(
      (row) =>
        derivePaymentStatus({
          canceledAt: row.canceledAt,
          confirmedPaidAt: row.confirmedPaidAt,
          expiresAt: row.expiresAt,
          hasActiveClaim: (row.activeClaimCount ?? 0) > 0,
          now,
        }) === "paid"
    )

    const totals = new Map<FiatCurrency, StationPaymentTotals>()
    const byEmployee = new Map<
      string,
      StationPaymentTotals & {
        readonly employeeId: EmployeeId | null
        readonly employeeName: string | null
        readonly currency: FiatCurrency
      }
    >()
    for (const row of paidRows) {
      totals.set(row.currency, addPayment(totals.get(row.currency), row))
      const key = `${row.employeeId ?? ""}:${row.currency}`
      byEmployee.set(key, {
        employeeId: row.employeeId,
        employeeName: row.employeeName,
        currency: row.currency,
        ...addPayment(byEmployee.get(key), row),
      })
    }

    return {
      stationId,
      totals: [...totals].map(([currency, total]) => ({ currency, ...total })),
      byEmployee: [...byEmployee.values()],
      reportedPaidUnconfirmed: stationRows.filter(
        (row) =>
          row.stationPaid === 1 &&
          (row.activeClaimCount ?? 0) === 0 &&
          row.canceledAt === null
      ).length,
    }
  })
}
