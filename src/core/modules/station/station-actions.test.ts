import { testCreateRun } from "@evolu/common"
import { describe, expect, test } from "vitest"

import { NonEmptyString255 } from "@/core/modules/shared/schema.ts"
import { createStation, revokeStation } from "./station-actions.ts"
import { getStationNostrPubkey } from "./station-identity-utils.ts"
import { stationsQuery } from "./station-queries.ts"
import { createStationTestContext } from "./station-test-fixtures.ts"

describe("createStation", () => {
  test("gives each station its own key and the next number, revoked ones counted", async () => {
    await using context = await createStationTestContext()
    await using run = testCreateRun(context.ownerDeps)
    await run.ok(revokeStation(context.stationId))

    await run.orThrow(createStation({ name: NonEmptyString255("Terrace") }))

    const stations = await context.ownerDeps.evolu.loadQuery(stationsQuery)
    expect(stations.map((station) => station.number)).toEqual([1, 2])
    const [, terrace] = stations
    if (terrace === undefined) throw new Error("No second station.")
    expect(terrace.masterKey).not.toBe(context.station.masterKey)
    expect(terrace.nostrPubkey).toBe(getStationNostrPubkey(terrace.masterKey))
  })
})
