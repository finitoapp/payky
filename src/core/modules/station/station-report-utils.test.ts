import { createIdFromString } from "@evolu/common"
import { describe, expect, test } from "vitest"

import {
  NonNegativeInteger,
  Sha256Hex,
  TimestampMs,
} from "@/core/modules/shared/schema.ts"
import type { StationPaymentInRangeRow } from "./station-queries.ts"
import {
  analyzeStationReportChain,
  computeStationReportHash,
  genesisReportHash,
  summarizeStationPayments,
} from "./station-report-utils.ts"

const chain = (payloads: ReadonlyArray<string>) => {
  const rows: Array<{ seq: number; hash: string; prevHash: string }> = []
  for (const payload of payloads) {
    const prevHash = Sha256Hex(rows.at(-1)?.hash ?? genesisReportHash)
    const seq = rows.length + 1
    rows.push({
      seq,
      prevHash,
      hash: computeStationReportHash({ seq, prevHash, payload }),
    })
  }
  return rows
}

describe("computeStationReportHash", () => {
  test("covers the seq, the link and the payload", () => {
    const hash = computeStationReportHash({
      seq: 1,
      prevHash: genesisReportHash,
      payload: "{}",
    })

    expect(hash).toMatch(/^[0-9a-f]{64}$/u)
    expect(
      computeStationReportHash({
        seq: 2,
        prevHash: genesisReportHash,
        payload: "{}",
      })
    ).not.toBe(hash)
    expect(
      computeStationReportHash({ seq: 1, prevHash: hash, payload: "{}" })
    ).not.toBe(hash)
    expect(
      computeStationReportHash({
        seq: 1,
        prevHash: genesisReportHash,
        payload: "{ }",
      })
    ).not.toBe(hash)
  })
})

describe("analyzeStationReportChain", () => {
  test("finds nothing wrong with a whole chain", () => {
    expect(analyzeStationReportChain(chain(["a", "b", "c"]), 3)).toEqual({
      lastReceivedSeq: 3,
      missingRanges: [],
      brokenLinkSeqs: [],
      conflictSeqs: [],
    })
  })

  test("finds gaps, the trailing one from the seq the station said it has", () => {
    const [first, , third, , fifth] = chain(["a", "b", "c", "d", "e"])
    const rows = [first, third, fifth].filter((row) => row !== undefined)

    expect(analyzeStationReportChain(rows, 7)).toMatchObject({
      lastReceivedSeq: 5,
      missingRanges: [
        { from: 2, to: 2 },
        { from: 4, to: 4 },
        { from: 6, to: 7 },
      ],
      brokenLinkSeqs: [],
    })
  })

  test("finds a report that does not link to the one before it", () => {
    const rows = chain(["a", "b", "c"]).map((row) =>
      row.seq === 3 ? { ...row, prevHash: "f".repeat(64) } : row
    )

    expect(analyzeStationReportChain(rows, null).brokenLinkSeqs).toEqual([3])
  })

  test("finds a seq sent twice with different content", () => {
    const rows = [
      ...chain(["a", "b"]),
      { seq: 2, prevHash: genesisReportHash, hash: "e".repeat(64) },
    ]

    expect(analyzeStationReportChain(rows, 2).conflictSeqs).toEqual([2])
  })
})

describe("summarizeStationPayments", () => {
  const stationId = createIdFromString<"Station">("station-1")
  const anna = createIdFromString<"Employee">("anna")
  const row = (
    overrides: Partial<StationPaymentInRangeRow>
  ): StationPaymentInRangeRow => ({
    id: createIdFromString<"Payment">(crypto.randomUUID()),
    stationId,
    employeeId: anna,
    employeeName: null,
    amount: NonNegativeInteger(1_100),
    currency: "CZK",
    tipAmount: NonNegativeInteger(100),
    canceledAt: null,
    confirmedPaidAt: null,
    expiresAt: null,
    originCreatedAt: TimestampMs(1),
    activeClaimCount: 1,
    stationPaid: 1,
    ...overrides,
  })

  test("totals what the owner holds money for, per employee", () => {
    const [summary] = summarizeStationPayments(
      [
        row({}),
        row({ employeeId: null }),
        row({ activeClaimCount: 0 }),
        row({ activeClaimCount: 0, stationPaid: 0 }),
      ],
      new Date()
    )

    expect(summary).toEqual({
      stationId,
      totals: [{ currency: "CZK", count: 2, amount: 2_200, tips: 200 }],
      byEmployee: [
        {
          employeeId: anna,
          employeeName: null,
          currency: "CZK",
          count: 1,
          amount: 1_100,
          tips: 100,
        },
        {
          employeeId: null,
          employeeName: null,
          currency: "CZK",
          count: 1,
          amount: 1_100,
          tips: 100,
        },
      ],
      reportedPaidUnconfirmed: 1,
    })
  })
})
