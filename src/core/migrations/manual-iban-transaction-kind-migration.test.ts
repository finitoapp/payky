import { sqliteTrue, testCreateRun } from "@evolu/common"
import { describe, expect, test } from "vitest"

import type { DateDep, EvoluOwnerIdDep } from "@/core/deps.ts"
import { createQuery } from "@/core/evolu/schema.ts"
import type { AccountId } from "@/core/modules/account/account-types.ts"
import { createAccountTransaction } from "@/core/modules/account-transaction/account-transaction-actions.ts"
import type { AccountTransactionId } from "@/core/modules/account-transaction/account-transaction-types.ts"
import { createPaymentAccounts } from "@/core/modules/payment/payment-test-fixtures.ts"
import type { EvoluDep } from "@/core/modules/shared/evolu-deps.ts"
import { runMutationWithCompletion } from "@/core/modules/shared/evolu-utils.ts"
import {
  NonNegativeInteger,
  TimestampMsSchema,
} from "@/core/modules/shared/schema.ts"
import { createTestDateDep } from "@/test/date-dep.ts"
import { createEvoluTest } from "@/test/evolu.ts"
import { evoluTestDeps } from "@/test/evolu-deps.ts"
import { manualIbanTransactionKindMigration } from "./manual-iban-transaction-kind-migration.ts"

const kindByIdQuery = (id: AccountTransactionId) =>
  createQuery((db) =>
    db.selectFrom("accountTransaction").select("kind").where("id", "=", id)
  )

describe("manualIbanTransactionKindMigration", () => {
  test("re-files cash-kind transactions on bank accounts as iban", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = {
      ...evoluTestDeps(evolu),
      ...createTestDateDep(),
    } satisfies EvoluDep & EvoluOwnerIdDep & DateDep
    await using run = testCreateRun(deps)
    const { cashRegisterAccountId, ibanAccountId } =
      await createPaymentAccounts(deps)

    // What `markPaymentPaidIban` used to write: no detail row, so cash.
    const recordCash = (accountId: AccountId) =>
      run.ok(
        createAccountTransaction({
          accountId,
          kind: "cashRegister",
          amount: NonNegativeInteger(1_000),
          currency: "CZK",
          occurredAt: TimestampMsSchema.decode(Date.now()),
          note: null,
          internalTransferGroupId: null,
          source: { deviceId: null, source: "manual" },
        })
      )
    const misfiled = await recordCash(ibanAccountId)
    const cash = await recordCash(cashRegisterAccountId)

    await expect(
      run(manualIbanTransactionKindMigration.hasWork)
    ).resolves.toMatchObject({ ok: true, value: true })
    await run.ok(manualIbanTransactionKindMigration.run)

    await expect
      .poll(() => evolu.loadQuery(kindByIdQuery(misfiled)))
      .toEqual([{ kind: "iban" }])
    await expect(evolu.loadQuery(kindByIdQuery(cash))).resolves.toEqual([
      { kind: "cashRegister" },
    ])
    await expect(
      run(manualIbanTransactionKindMigration.hasWork)
    ).resolves.toMatchObject({ ok: true, value: false })

    // A tombstoned account still counts: `accountDerivedIdMigration` leaves
    // the older transactions pointing at the legacy account it deleted.
    const onDeletedAccount = await recordCash(ibanAccountId)
    await runMutationWithCompletion((options) =>
      evolu.update(
        "account",
        { id: ibanAccountId, isDeleted: sqliteTrue },
        { ...options, ownerId: deps.evoluOwnerId }
      )
    )
    await expect(
      run(manualIbanTransactionKindMigration.hasWork)
    ).resolves.toMatchObject({ ok: true, value: true })
    await run.ok(manualIbanTransactionKindMigration.run)
    await expect
      .poll(() => evolu.loadQuery(kindByIdQuery(onDeletedAccount)))
      .toEqual([{ kind: "iban" }])
  }, 15_000)
})
