import { testCreateRun } from "@evolu/common"
import { describe, expect, test } from "vitest"
import { createTestDateDep } from "../../testing/date-dep.ts"
import { createEvoluTest } from "../../testing/evolu.ts"
import { evoluTestDeps } from "../../testing/evolu-deps.ts"
import { createAccount } from "../account/account-actions.ts"
import type { AccountId } from "../account/account-types.ts"
import {
  createAccountTransaction,
  deleteAccountTransaction,
} from "../account-transaction/account-transaction-actions.ts"
import type { EvoluDep } from "../shared/evolu-deps.ts"
import {
  createRowId,
  runMutationWithCompletion,
} from "../shared/evolu-utils.ts"
import { SparkSecret } from "../shared/key-derivation.ts"
import {
  BitcoinAddress,
  Integer,
  NonEmptyString255,
  NonEmptyStringSchema,
  NonNegativeInteger,
  PositiveInteger,
  TimestampMs,
} from "../shared/schema.ts"
import { markWithdrawalFailed } from "./withdraw-actions.ts"
import {
  toWithdrawalView,
  withdrawalDetailQuery,
  withdrawalsByAccountQuery,
} from "./withdraw-queries.ts"

const setUp = async () => {
  const testEvolu = await createEvoluTest()
  const { evolu } = testEvolu
  const deps = {
    ...evoluTestDeps(evolu),
    ...createTestDateDep(),
  }
  await using run = testCreateRun(deps)
  const accountId = await run.ok(
    createAccount({
      deviceId: null,
      name: NonEmptyString255("Spark wallet"),
      spark: { secret: SparkSecret("42373a7543db65ae0228ead6c9cbffcc") },
    })
  )
  return { testEvolu, evolu, deps, accountId }
}

const recordWithdrawal = async (
  evolu: EvoluDep["evolu"],
  accountId: AccountId,
  kind: "onchain" | "lightning"
) => {
  const id = createRowId<"Withdrawal">()
  const accountTransactionId = createRowId<"AccountTransaction">()
  await runMutationWithCompletion((options) => {
    const mutationOptions = { ...options, owner: evolu.appOwner }
    evolu.upsert(
      "withdrawal",
      {
        id,
        accountId,
        deviceId: null,
        amountSats: PositiveInteger(1000),
        accountTransactionId,
        failedAt: null,
        failureReason: null,
      },
      mutationOptions
    )
    if (kind === "onchain") {
      evolu.upsert(
        "withdrawalOnchain",
        {
          id,
          onchainAddress: BitcoinAddress(
            "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq"
          ),
          exitSpeed: "slow",
          feeSats: NonNegativeInteger(250),
        },
        mutationOptions
      )
    } else {
      evolu.upsert(
        "withdrawalLightning",
        {
          id,
          lightningAddress: NonEmptyStringSchema.decode("alice@example.com"),
          lnInvoice: NonEmptyStringSchema.decode("lnbc1invoice"),
          sparkTransferId: NonEmptyStringSchema.decode("transfer-1"),
          maxFeeSats: NonNegativeInteger(13),
        },
        mutationOptions
      )
    }
  })
  return { id, accountTransactionId }
}

describe("withdrawal queries", () => {
  test("type comes from the detail row and a pending withdrawal has no outcome", async () => {
    const { testEvolu, evolu, accountId } = await setUp()
    await using _ = testEvolu
    await recordWithdrawal(evolu, accountId, "onchain")
    await recordWithdrawal(evolu, accountId, "lightning")

    const views = (
      await evolu.loadQuery(withdrawalsByAccountQuery(accountId, 50))
    ).map(toWithdrawalView)

    expect(views).toHaveLength(2)
    expect(views).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          target: {
            kind: "onchain",
            onchainAddress: "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq",
            exitSpeed: "slow",
            quotedFeeSats: 250,
          },
          state: { status: "pending" },
        }),
        expect.objectContaining({
          target: {
            kind: "lightning",
            lightningAddress: "alice@example.com",
            lnInvoice: "lnbc1invoice",
            sparkTransferId: "transfer-1",
            maxFeeSats: 13,
          },
          state: { status: "pending" },
        }),
      ])
    )
  })

  test("returns at most `limit` withdrawals for the history's paging", async () => {
    const { testEvolu, evolu, accountId } = await setUp()
    await using _ = testEvolu
    await recordWithdrawal(evolu, accountId, "onchain")
    await recordWithdrawal(evolu, accountId, "lightning")
    await recordWithdrawal(evolu, accountId, "onchain")

    expect(
      await evolu.loadQuery(withdrawalsByAccountQuery(accountId, 2))
    ).toHaveLength(2)
  })

  test("failedAt makes a withdrawal failed, with its reason", async () => {
    const { testEvolu, evolu, deps, accountId } = await setUp()
    await using _ = testEvolu
    const { id } = await recordWithdrawal(evolu, accountId, "lightning")
    await using run = testCreateRun(deps)
    await run.ok(markWithdrawalFailed({ withdrawalId: id, reason: "returned" }))

    const [row] = await evolu.loadQuery(withdrawalDetailQuery(id))

    expect(row && toWithdrawalView(row)?.state).toMatchObject({
      status: "failed",
      reason: "returned",
    })
  })

  test("a deleted movement still makes the withdrawal done", async () => {
    const { testEvolu, evolu, deps, accountId } = await setUp()
    await using _ = testEvolu
    const { id, accountTransactionId } = await recordWithdrawal(
      evolu,
      accountId,
      "lightning"
    )
    await using run = testCreateRun(deps)
    await run.ok(
      createAccountTransaction({
        id: accountTransactionId,
        accountId,
        amount: Integer(-1010),
        currency: "BTC",
        occurredAt: TimestampMs(1),
        note: null,
        internalTransferGroupId: null,
        spark: {
          sparkTransferId: NonEmptyStringSchema.decode("transfer-1"),
        },
        source: { deviceId: null, source: "auto" },
      })
    )
    await run.ok(deleteAccountTransaction(accountTransactionId))

    const [row] = await evolu.loadQuery(withdrawalDetailQuery(id))

    expect(row && toWithdrawalView(row)?.state).toEqual({
      status: "done",
      movementDeleted: true,
      debitedSats: 1010,
      feeSats: 10,
      txid: null,
      coopExitRequestId: null,
      preImage: null,
      sparkTransferId: "transfer-1",
    })
  })

  test("names no device for a withdrawal without one", async () => {
    const { testEvolu, evolu, accountId } = await setUp()
    await using _ = testEvolu
    const { id } = await recordWithdrawal(evolu, accountId, "onchain")

    const [row] = await evolu.loadQuery(withdrawalDetailQuery(id))

    expect(row && toWithdrawalView(row)).toMatchObject({
      deviceId: null,
      deviceName: null,
    })
  })

  test("carries the merchant's comment to the history and the detail", async () => {
    const { testEvolu, evolu, accountId } = await setUp()
    await using _ = testEvolu
    const { id } = await recordWithdrawal(evolu, accountId, "lightning")
    await runMutationWithCompletion((options) =>
      evolu.update(
        "withdrawal",
        { id, comment: NonEmptyString255("Rent for October") },
        { ...options, owner: evolu.appOwner }
      )
    )

    const [listed] = await evolu.loadQuery(
      withdrawalsByAccountQuery(accountId, 50)
    )
    const [detail] = await evolu.loadQuery(withdrawalDetailQuery(id))

    expect(listed && toWithdrawalView(listed)?.comment).toBe("Rent for October")
    expect(detail && toWithdrawalView(detail)?.comment).toBe("Rent for October")
  })
})
