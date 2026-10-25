import { testCreateRun } from "@evolu/common"
import { describe, expect, test } from "vitest"
import { createTestDateDep } from "../../testing/date-dep.ts"
import { createEvoluTest } from "../../testing/evolu.ts"
import { evoluTestDeps } from "../../testing/evolu-deps.ts"
import { NonNegativeInteger } from "../shared/schema.ts"
import {
  cancelPayment,
  createPayment,
  markPaymentPaidCash,
} from "./payment-actions.ts"
import { firstPaidPaymentQuery } from "./payment-queries.ts"
import { createPaymentAccounts } from "./payment-test-fixtures.ts"

describe("firstPaidPaymentQuery", () => {
  const newPayment = (
    accountId: Parameters<typeof createPayment>[0]["cashRegister"]
  ) =>
    createPayment({
      deviceId: null,
      billId: null,
      tableId: null,
      amount: NonNegativeInteger(12_900),
      currency: "CZK",
      tipAmount: NonNegativeInteger(0),
      canceledAt: null,
      expiresAt: null,
      cashRegister: accountId,
    })

  test("finds nothing for a payment that was only created", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = { ...evoluTestDeps(evolu), ...createTestDateDep() }
    await using run = testCreateRun(deps)
    const { cashRegisterAccountId } = await createPaymentAccounts(deps)

    await run.orThrow(newPayment({ accountId: cashRegisterAccountId }))

    expect(await evolu.loadQuery(firstPaidPaymentQuery)).toEqual([])
  }, 15_000)

  test("finds a payment once money is claimed against it", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = { ...evoluTestDeps(evolu), ...createTestDateDep() }
    await using run = testCreateRun(deps)
    const { cashRegisterAccountId } = await createPaymentAccounts(deps)

    const id = await run.orThrow(
      newPayment({ accountId: cashRegisterAccountId })
    )
    await run.orThrow(
      markPaymentPaidCash({ paymentId: id, accountId: cashRegisterAccountId })
    )

    await expect
      .poll(() => evolu.loadQuery(firstPaidPaymentQuery))
      .toEqual([{ id }])
  }, 15_000)

  test("ignores a canceled payment", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = { ...evoluTestDeps(evolu), ...createTestDateDep() }
    await using run = testCreateRun(deps)
    const { cashRegisterAccountId } = await createPaymentAccounts(deps)

    const id = await run.orThrow(
      newPayment({ accountId: cashRegisterAccountId })
    )
    await run.orThrow(cancelPayment(id))

    expect(await evolu.loadQuery(firstPaidPaymentQuery)).toEqual([])
  }, 15_000)
})
