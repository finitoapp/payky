import { sqliteTrue, testCreateRun } from "@evolu/common"
import { describe, expect, test } from "vitest"

import { generateDemoData } from "@/core/demo-data/demo-data-generator.ts"
import { createQuery } from "@/core/evolu/schema.ts"
import { MasterKey } from "@/core/modules/shared/key-derivation.ts"
import { createEvoluTest } from "@/test/evolu.ts"
import { evoluTestDeps } from "@/test/evolu-deps.ts"

const paymentsQuery = createQuery((db) =>
  db
    .selectFrom("payment")
    .select((eb) => [
      "payment.createdAt",
      "payment.canceledAt",
      eb
        .selectFrom("reconciliationClaim")
        .select(eb.fn.countAll<number>().as("count"))
        .whereRef("reconciliationClaim.paymentId", "=", "payment.id")
        .where("reconciliationClaim.isDeleted", "is not", sqliteTrue)
        .as("claims"),
    ])
    .orderBy("payment.createdAt")
)

describe("generateDemoData", () => {
  test("records a backdated history whose every payment is settled or canceled, with EET left unset", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    await using run = testCreateRun({
      ...evoluTestDeps(evolu),
      masterKey: MasterKey("000102030405060708090a0b0c0d0e0f"),
    })
    const now = new Date("2026-06-05T15:00:00")

    const { payments } = await run.ok(
      generateDemoData({
        language: "cs",
        now,
        days: 3,
        customersPerDay: 12,
        seed: 1,
      })
    )
    const rows = await evolu.loadQuery(paymentsQuery)
    const createdAt = rows.map((row) => Date.parse(row.createdAt))

    expect(payments).toBeGreaterThan(10)
    expect(Math.min(...createdAt)).toBeLessThan(now.getTime() - 48 * 3_600_000)
    expect(Math.max(...createdAt)).toBeLessThan(now.getTime() - 15 * 60_000)
    expect(
      rows.filter((row) => row.canceledAt === null && row.claims !== 1)
    ).toEqual([])
    expect(
      await evolu.loadQuery(
        createQuery((db) => db.selectFrom("eetSettings").select("id"))
      )
    ).toEqual([])
    expect(
      await evolu.loadQuery(
        createQuery((db) => db.selectFrom("eetSale").select("id"))
      )
    ).toEqual([])
  }, 60_000)

  test("stopped early, leaves the newest days with bills numbered as if the older ones existed", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    await using run = testCreateRun({
      ...evoluTestDeps(evolu),
      masterKey: MasterKey("000102030405060708090a0b0c0d0e0f"),
    })
    const now = new Date("2026-06-05T15:00:00")
    let finishedDays = 0

    const result = await run.ok(
      generateDemoData({
        language: "cs",
        now,
        days: 5,
        customersPerDay: 8,
        seed: 2,
        onProgress: (done) => {
          finishedDays = done
        },
        shouldStop: () => finishedDays >= 2,
      })
    )
    const payments = await evolu.loadQuery(paymentsQuery)
    const bills = await evolu.loadQuery(
      createQuery((db) =>
        db
          .selectFrom("bill")
          .select(["createdAt", "displayNumber"])
          .orderBy("createdAt")
      )
    )
    const yesterday = new Date("2026-06-04T00:00:00").getTime()

    expect(result.days).toBe(2)
    expect(
      Math.min(...payments.map((row) => Date.parse(row.createdAt)))
    ).toBeGreaterThanOrEqual(yesterday)
    // Opened in time order, numbered in time order, and not from 1: three
    // older days were planned but never written.
    const numbers = bills.map((row) => row.displayNumber ?? 0)
    expect(numbers).toEqual(numbers.toSorted((a, b) => a - b))
    expect(numbers[0]).toBeGreaterThan(1)
  }, 60_000)
})
