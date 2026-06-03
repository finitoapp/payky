import { testCreateRun } from "@evolu/common"
import { describe, expect, test } from "vitest"

import { saveCashRegisterAccount } from "@/core/modules/account/account-actions.ts"
import { cashRegisterAccountId } from "@/core/modules/account/account-utils.ts"
import type { EvoluDep } from "@/core/modules/shared/evolu-deps.ts"
import { createEvoluTest } from "../../evolu/cli-client"
import { setDefaultPaymentAccount } from "./default-payment-account-actions.ts"
import { activeDefaultPaymentAccountsQuery } from "./default-payment-account-queries.ts"

describe("default payment account actions", () => {
  test("toggles a default payment account through real Evolu", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = { evolu } satisfies EvoluDep
    await using run = testCreateRun(deps)

    await run.orThrow(
      saveCashRegisterAccount({
        enabled: true,
        currency: "CZK",
      })
    )

    await expect(
      run(
        setDefaultPaymentAccount({
          accountId: cashRegisterAccountId,
          enabled: true,
        })
      )
    ).resolves.toEqual({ ok: true, value: cashRegisterAccountId })

    await expect
      .poll(() => evolu.loadQuery(activeDefaultPaymentAccountsQuery))
      .toMatchObject([
        {
          id: cashRegisterAccountId,
          kind: "cashRegister",
          name: "Cash register",
        },
      ])

    await run.orThrow(
      setDefaultPaymentAccount({
        accountId: cashRegisterAccountId,
        enabled: false,
      })
    )

    await expect
      .poll(() => evolu.loadQuery(activeDefaultPaymentAccountsQuery))
      .toEqual([])
  })
})
