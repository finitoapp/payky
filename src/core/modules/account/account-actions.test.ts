import {
  evoluJsonObjectFrom,
  sqliteFalse,
  sqliteTrue,
  testCreateRun,
} from "@evolu/common"
import { describe, expect, test } from "vitest"
import { createQuery } from "@/core/evolu/schema.ts"
import type { EvoluDep } from "@/core/modules/shared/evolu-deps.ts"
import { createEvoluTest } from "../../evolu/cli-client"
import {
  deriveDefaultSparkWalletSecret,
  MasterKey,
  SparkSecret,
} from "../shared/key-derivation.ts"
import {
  createAccount,
  deleteAccount,
  loadAccount,
  saveFiatBankAccount,
  saveSparkAccount,
  updateAccount,
} from "./account-actions.ts"
import {
  accountByIdQuery,
  fiatBankAccountQuery,
  sparkAccountQuery,
} from "./account-queries.ts"
import type { AccountId } from "./account-types.ts"
import { fiatBankAccountId, sparkAccountId } from "./account-utils.ts"

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
              "accountSpark.secret",
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
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = { evolu } satisfies EvoluDep
    await using run = testCreateRun(deps)

    const ibanAccountId = await run.orThrow(
      createAccount({
        deviceId: null,
        name: "Bank account",
        iban: {
          iban: "CZ6508000000192000145399",
          currency: "CZK",
        },
      })
    )
    const sparkAccountId = await run.orThrow(
      createAccount({
        deviceId: null,
        name: "Spark wallet",
        spark: {
          secret: "42373a7543db65ae0228ead6c9cbffcc",
        },
      })
    )
    const cashRegisterAccountId = await run.orThrow(
      createAccount({
        deviceId: null,
        name: "Cash register",
        cashRegister: {
          currency: "CZK",
        },
      })
    )

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
            secret: "42373a7543db65ae0228ead6c9cbffcc",
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

    await expect(run(loadAccount(ibanAccountId))).resolves.toMatchObject({
      ok: true,
      value: {
        id: ibanAccountId,
        name: "Bank account",
        kind: "iban",
      },
    })
  }, 15_000)

  test("updates account details without writing undefined values", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = { evolu } satisfies EvoluDep
    await using run = testCreateRun(deps)

    const id = await run.orThrow(
      createAccount({
        deviceId: null,
        name: "Bank account",
        iban: {
          iban: "CZ6508000000192000145399",
          currency: "CZK",
        },
      })
    )

    await expect
      .poll(() => evolu.loadQuery(accountByIdQuery(id)))
      .toHaveLength(1)

    await expect(
      run(
        updateAccount({
          id,
          deviceId: undefined,
          name: "Updated bank account",
          iban: {
            iban: "CZ5508000000001234567899",
            currency: undefined,
          },
        })
      )
    ).resolves.toEqual({ ok: true, value: id })

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
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = { evolu } satisfies EvoluDep
    await using run = testCreateRun(deps)

    const id = await run.orThrow(
      createAccount({
        deviceId: null,
        name: "Cash register",
        cashRegister: {
          currency: "CZK",
        },
      })
    )

    await expect
      .poll(() => evolu.loadQuery(accountByIdQuery(id)))
      .toHaveLength(1)

    await expect(run(deleteAccount(id))).resolves.toEqual({
      ok: true,
      value: id,
    })

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
    await expect(run(loadAccount(id))).resolves.toMatchObject({
      ok: true,
      value: {
        id,
        isDeleted: sqliteTrue,
      },
    })
  }, 15_000)

  test("saves the deterministic fiat bank account and toggles soft delete", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = { evolu } satisfies EvoluDep
    await using run = testCreateRun(deps)

    await expect(
      run(
        saveFiatBankAccount({
          enabled: true,
          iban: "CZ6508000000192000145399",
          currency: "CZK",
        })
      )
    ).resolves.toEqual({ ok: true, value: fiatBankAccountId })

    await expect
      .poll(() => evolu.loadQuery(fiatBankAccountQuery))
      .toMatchObject([
        {
          id: fiatBankAccountId,
          name: "Fiat bank account",
          kind: "iban",
          isDeleted: sqliteFalse,
          iban: "CZ6508000000192000145399",
          currency: "CZK",
        },
      ])

    await expect(
      run(
        saveFiatBankAccount({
          enabled: false,
          iban: "CZ5508000000001234567899",
          currency: "EUR",
        })
      )
    ).resolves.toEqual({ ok: true, value: fiatBankAccountId })

    await expect
      .poll(() => evolu.loadQuery(fiatBankAccountQuery))
      .toMatchObject([
        {
          id: fiatBankAccountId,
          isDeleted: sqliteTrue,
          iban: "CZ5508000000001234567899",
          currency: "EUR",
        },
      ])

    await expect(
      run(
        saveFiatBankAccount({
          enabled: true,
          currency: "CZK",
        })
      )
    ).resolves.toEqual({ ok: true, value: fiatBankAccountId })

    await expect
      .poll(() => evolu.loadQuery(fiatBankAccountQuery))
      .toMatchObject([
        {
          id: fiatBankAccountId,
          isDeleted: sqliteFalse,
          iban: "CZ5508000000001234567899",
          currency: "EUR",
        },
      ])
  }, 15_000)

  test("derives the default Spark wallet secret from the master key", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const masterKey = MasterKey("000102030405060708090a0b0c0d0e0f")
    await using run = testCreateRun({ evolu, masterKey })

    await expect(run(saveSparkAccount({ enabled: true }))).resolves.toEqual({
      ok: true,
      value: {
        accountId: expect.any(String),
        secret: deriveDefaultSparkWalletSecret(masterKey),
      },
    })

    await expect
      .poll(() => evolu.loadQuery(sparkAccountQuery))
      .toMatchObject([
        {
          isDeleted: sqliteFalse,
          secret: deriveDefaultSparkWalletSecret(masterKey),
        },
      ])
  })

  test("never overwrites an already-attached Spark wallet secret", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const masterKey = MasterKey("000102030405060708090a0b0c0d0e0f")
    await using run = testCreateRun({ evolu, masterKey })

    const attachedSecret = SparkSecret("7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f")
    await run.orThrow(
      updateAccount({
        id: sparkAccountId,
        deviceId: undefined,
        name: "Spark account",
        spark: { secret: attachedSecret },
      })
    )

    await expect(run(saveSparkAccount({ enabled: true }))).resolves.toEqual({
      ok: true,
      value: { accountId: sparkAccountId, secret: attachedSecret },
    })

    await expect
      .poll(() => evolu.loadQuery(sparkAccountQuery))
      .toMatchObject([{ isDeleted: sqliteFalse, secret: attachedSecret }])
  })
})
