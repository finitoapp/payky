import { evoluJsonObjectFrom, sqliteTrue } from "@evolu/common"
import { describe, expect, test } from "vitest"
import { createQuery } from "@/core/evolu/schema.ts"
import type { EvoluDep } from "@/core/modules/shared/evolu-deps.ts"
import { createEvoluCli } from "../../evolu/cli-client"
import {
  createAccount,
  deleteAccount,
  loadAccount,
  updateAccount,
} from "./account-actions.ts"
import { accountByIdQuery } from "./account-queries.ts"
import type { AccountId } from "./account-types.ts"

const accountWithDetailsByIdQuery = (id: AccountId) =>
  createQuery((db) =>
    db
      .selectFrom("account")
      .select((eb) => [
        "account.id",
        "account.deviceId",
        "account.name",
        "account.kind",
        "account.isDeleted",
        evoluJsonObjectFrom(
          eb
            .selectFrom("accountIban")
            .select([
              "accountIban.id",
              "accountIban.iban",
              "accountIban.currency",
              "accountIban.isDeleted",
            ])
            .whereRef("accountIban.id", "=", "account.id")
        ).as("iban"),
        evoluJsonObjectFrom(
          eb
            .selectFrom("accountSpark")
            .select([
              "accountSpark.id",
              "accountSpark.mnemonic",
              "accountSpark.isDeleted",
            ])
            .whereRef("accountSpark.id", "=", "account.id")
        ).as("spark"),
        evoluJsonObjectFrom(
          eb
            .selectFrom("accountCashRegister")
            .select([
              "accountCashRegister.id",
              "accountCashRegister.currency",
              "accountCashRegister.isDeleted",
            ])
            .whereRef("accountCashRegister.id", "=", "account.id")
        ).as("cashRegister"),
      ])
      .where("account.id", "=", id)
  )

describe("account actions", () => {
  test("creates and loads account variants through real Evolu", async () => {
    await using testEvolu = await createEvoluCli()
    const { evolu } = testEvolu
    const deps = { evolu } satisfies EvoluDep

    const ibanAccountId = await createAccount(deps)({
      deviceId: null,
      name: "Bank account",
      iban: {
        iban: "CZ6508000000192000145399",
        currency: "CZK",
      },
    })
    const sparkAccountId = await createAccount(deps)({
      deviceId: null,
      name: "Spark wallet",
      spark: {
        mnemonic:
          "legal winner thank year wave sausage worth useful legal winner thank yellow",
      },
    })
    const cashRegisterAccountId = await createAccount(deps)({
      deviceId: null,
      name: "Cash register",
      cashRegister: {
        currency: "CZK",
      },
    })

    await expect
      .poll(() => evolu.loadQuery(accountWithDetailsByIdQuery(ibanAccountId)))
      .toMatchObject([
        {
          id: ibanAccountId,
          deviceId: null,
          name: "Bank account",
          kind: "iban",
          iban: {
            id: ibanAccountId,
            iban: "CZ6508000000192000145399",
            currency: "CZK",
          },
          spark: null,
          cashRegister: null,
        },
      ])

    await expect
      .poll(() => evolu.loadQuery(accountWithDetailsByIdQuery(sparkAccountId)))
      .toMatchObject([
        {
          id: sparkAccountId,
          deviceId: null,
          name: "Spark wallet",
          kind: "spark",
          iban: null,
          spark: {
            id: sparkAccountId,
            mnemonic:
              "legal winner thank year wave sausage worth useful legal winner thank yellow",
          },
          cashRegister: null,
        },
      ])

    await expect
      .poll(() => evolu.loadQuery(accountByIdQuery(cashRegisterAccountId)))
      .toMatchObject([
        {
          id: cashRegisterAccountId,
          deviceId: null,
          name: "Cash register",
          kind: "cashRegister",
        },
      ])
    await expect
      .poll(() =>
        evolu.loadQuery(accountWithDetailsByIdQuery(cashRegisterAccountId))
      )
      .toMatchObject([
        {
          id: cashRegisterAccountId,
          deviceId: null,
          name: "Cash register",
          kind: "cashRegister",
          iban: null,
          spark: null,
          cashRegister: {
            id: cashRegisterAccountId,
            currency: "CZK",
          },
        },
      ])

    await expect(loadAccount(deps)(ibanAccountId)).resolves.toMatchObject({
      ok: true,
      value: {
        id: ibanAccountId,
        name: "Bank account",
        kind: "iban",
      },
    })
  }, 15_000)

  test("updates account details without writing undefined values", async () => {
    await using testEvolu = await createEvoluCli()
    const { evolu } = testEvolu
    const deps = { evolu } satisfies EvoluDep

    const id = await createAccount(deps)({
      deviceId: null,
      name: "Bank account",
      iban: {
        iban: "CZ6508000000192000145399",
        currency: "CZK",
      },
    })

    await expect
      .poll(() => evolu.loadQuery(accountByIdQuery(id)))
      .toHaveLength(1)

    await expect(
      updateAccount(deps)({
        id,
        deviceId: undefined,
        name: "Updated bank account",
        iban: {
          iban: "CZ5508000000001234567899",
          currency: undefined,
        },
      })
    ).resolves.toBe(id)

    await expect
      .poll(() => evolu.loadQuery(accountWithDetailsByIdQuery(id)))
      .toMatchObject([
        {
          id,
          deviceId: null,
          name: "Updated bank account",
          kind: "iban",
          iban: {
            id,
            iban: "CZ5508000000001234567899",
            currency: "CZK",
          },
        },
      ])
  }, 15_000)

  test("soft deletes only the account root row", async () => {
    await using testEvolu = await createEvoluCli()
    const { evolu } = testEvolu
    const deps = { evolu } satisfies EvoluDep

    const id = await createAccount(deps)({
      deviceId: null,
      name: "Cash register",
      cashRegister: {
        currency: "CZK",
      },
    })

    await expect
      .poll(() => evolu.loadQuery(accountByIdQuery(id)))
      .toHaveLength(1)

    await expect(deleteAccount(deps)(id)).resolves.toBe(id)

    await expect
      .poll(() => evolu.loadQuery(accountWithDetailsByIdQuery(id)))
      .toMatchObject([
        {
          id,
          isDeleted: sqliteTrue,
          cashRegister: {
            currency: "CZK",
            isDeleted: null,
          },
        },
      ])
    await expect(loadAccount(deps)(id)).resolves.toMatchObject({
      ok: true,
      value: {
        id,
        isDeleted: sqliteTrue,
      },
    })
  }, 15_000)
})
