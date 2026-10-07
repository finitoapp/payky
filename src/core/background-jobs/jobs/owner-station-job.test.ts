import { testCreateRun } from "@evolu/common"
import { generateSecretKey } from "nostr-tools/pure"
import { describe, expect, test } from "vitest"

import { createOwnerStationJob } from "@/core/background-jobs/jobs/owner-station-job.ts"
import { createQuery } from "@/core/evolu/schema.ts"
import {
  createGiftWrap,
  publishGiftWrap,
  unwrapVerifiedRumor,
} from "@/core/integrations/nostr/nostr-gift-wrap.ts"
import { createRowId } from "@/core/modules/shared/evolu-utils.ts"
import {
  deriveNostrSecretKey,
  NostrSecretKey,
} from "@/core/modules/shared/key-derivation.ts"
import { revokeStation } from "@/core/modules/station/station-actions.ts"
import { getStationCommsPubkey } from "@/core/modules/station/station-identity-utils.ts"
import {
  encodeStationMessage,
  stationRumorKind,
} from "@/core/modules/station/station-protocol.ts"
import {
  computeStationReportHash,
  genesisReportHash,
} from "@/core/modules/station/station-report-utils.ts"
import {
  createStationTestContext,
  ownerMasterKey,
  type StationTestContext,
} from "@/core/modules/station/station-test-fixtures.ts"

const stationReportsQuery = createQuery((db) =>
  db.selectFrom("stationReport").select(["id"])
)

/** One valid report about the context's station, sealed by `senderKey`. */
const sendReport = async (
  context: StationTestContext,
  senderKey: NostrSecretKey
) => {
  const payload = JSON.stringify({
    paymentId: createRowId<"Payment">(),
    stationId: context.stationId,
    employeeId: null,
    createdAt: 1_780_000_000_000,
    amount: 100,
    currency: "CZK",
    tipAmount: 0,
    canceledAt: null,
    expiresAt: null,
    number: null,
    cash: null,
    iban: null,
    spark: null,
    settlements: [],
  })
  const ownerPubkey = getStationCommsPubkey(ownerMasterKey)
  await publishGiftWrap(
    context.relay.nostr,
    createGiftWrap({
      kind: stationRumorKind,
      content: encodeStationMessage({
        v: 1,
        type: "reports",
        configHash: null,
        lastSeq: 1,
        reports: [
          {
            seq: 1,
            prevHash: genesisReportHash,
            hash: computeStationReportHash({
              seq: 1,
              prevHash: genesisReportHash,
              payload,
            }),
            payload,
          },
        ],
      }),
      tags: [["p", ownerPubkey]],
      senderSecretKey: senderKey,
      recipientPubkey: ownerPubkey,
      createdAt: Math.floor(Date.now() / 1000),
    }),
    senderKey
  )
}

/** What the station's key received from the owner, by message type. */
const receivedTypes = (context: StationTestContext): ReadonlyArray<string> => {
  const stationKey = deriveNostrSecretKey(context.station.masterKey)
  return context.relay.stored.flatMap((wrap) => {
    const rumor = unwrapVerifiedRumor({ wrap, secretKey: stationKey })
    return rumor === null ? [] : [JSON.parse(rumor.content).type]
  })
}

const startOwnerJob = async (context: StationTestContext) => {
  const run = testCreateRun(context.ownerDeps)
  const job = await run.ok(createOwnerStationJob())
  return {
    [Symbol.asyncDispose]: async () => {
      await job[Symbol.asyncDispose]()
      await run[Symbol.asyncDispose]()
    },
  }
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 200))

describe("owner station job", () => {
  test("sends a new station its config", async () => {
    await using context = await createStationTestContext()
    await using _job = await startOwnerJob(context)

    await expect
      .poll(() => receivedTypes(context), { timeout: 5_000 })
      .toContain("config")
  })

  test("ignores reports from a key that is no station of its", async () => {
    await using context = await createStationTestContext()
    await using _job = await startOwnerJob(context)

    await sendReport(
      context,
      NostrSecretKey(new Uint8Array(generateSecretKey()))
    )
    await settle()

    expect(
      await context.ownerDeps.evolu.loadQuery(stationReportsQuery)
    ).toEqual([])
  })

  test("takes nothing from a revoked station and tells it it is revoked", async () => {
    await using context = await createStationTestContext()
    await using ownerRun = testCreateRun(context.ownerDeps)
    await ownerRun.ok(revokeStation(context.stationId))
    await using _job = await startOwnerJob(context)

    await sendReport(context, deriveNostrSecretKey(context.station.masterKey))
    await settle()

    expect(
      await context.ownerDeps.evolu.loadQuery(stationReportsQuery)
    ).toEqual([])
    expect(receivedTypes(context)).toContain("revoked")
    expect(receivedTypes(context)).not.toContain("ack")
  })

  test("acknowledges a report from its station", async () => {
    await using context = await createStationTestContext()
    await using _job = await startOwnerJob(context)

    await sendReport(context, deriveNostrSecretKey(context.station.masterKey))

    await expect
      .poll(() => receivedTypes(context), { timeout: 5_000 })
      .toContain("ack")
    expect(
      await context.ownerDeps.evolu.loadQuery(stationReportsQuery)
    ).toHaveLength(1)
  })
})
