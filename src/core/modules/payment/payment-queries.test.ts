import { createIdFromString, testCreateRun } from "@evolu/common"
import { describe, expect, test } from "vitest"

import { createEvoluTest } from "@/core/evolu/cli-client.ts"
import { NonNegativeInteger } from "@/core/modules/shared/schema.ts"
import { createTestDateDep } from "@/test/date-dep.ts"
import { createPayment } from "./payment-actions.ts"
import { latestPaymentsQuery } from "./payment-queries.ts"

describe("latestPaymentsQuery", () => {
  test("narrows to one station's payments, or to the owner's own", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    await using run = testCreateRun({
      evolu,
      evoluOwnerId: evolu.appOwner.id,
      ...createTestDateDep(),
    })
    const stationId = createIdFromString<"Station">("station-1")
    const create = (station: typeof stationId | null) =>
      run.orThrow(
        createPayment({
          deviceId: null,
          billId: null,
          tableId: null,
          amount: NonNegativeInteger(100),
          currency: "CZK",
          tipAmount: NonNegativeInteger(0),
          canceledAt: null,
          expiresAt: null,
          stationId: station,
        })
      )
    const own = await create(null)
    const atStation = await create(stationId)
    const ids = async (filter: Parameters<typeof latestPaymentsQuery>[1]) =>
      (await evolu.loadQuery(latestPaymentsQuery(10, filter)))
        .map((row) => row.id)
        .toSorted()

    expect(await ids({})).toEqual([own, atStation].toSorted())
    expect(await ids({ stationId })).toEqual([atStation])
    expect(await ids({ stationId: null })).toEqual([own])
  })
})
