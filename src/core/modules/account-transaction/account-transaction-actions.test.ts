import { evoluJsonObjectFrom, sqliteTrue, testCreateRun } from "@evolu/common"
import { describe, expect, test } from "vitest"

import type { DateDep, EvoluOwnerIdDep } from "@/core/deps.ts"
import { createEvoluTest } from "@/core/evolu/cli-client.ts"
import { createQuery } from "@/core/evolu/schema.ts"
import { createAccount } from "@/core/modules/account/account-actions.ts"
import type { EvoluDep } from "@/core/modules/shared/evolu-deps.ts"
import { SparkSecret } from "@/core/modules/shared/key-derivation.ts"
import {
  IbanSchema,
  Integer,
  NonEmptyString255,
  NonEmptyStringSchema,
  VariableSymbol,
} from "@/core/modules/shared/schema.ts"
import {
  createAccountTransaction,
  deleteAccountTransaction,
  updateAccountTransaction,
} from "./account-transaction-actions.ts"
import type { AccountTransactionId } from "./account-transaction-types.ts"

const fixedDate = new Date("2026-06-05T12:00:00.000Z")

const createDateDeps = (): DateDep => ({
  date: {
    now: () => fixedDate,
  },
})

const createDeps = (evolu: EvoluDep["evolu"]) =>
  ({
    evolu,
    evoluOwnerId: evolu.appOwner.id,
    ...createDateDeps(),
  }) satisfies EvoluDep & EvoluOwnerIdDep & DateDep

const accountTransactionsQuery = createQuery((db) =>
  db
    .selectFrom("accountTransaction")
    .select(["id", "accountId", "amount", "kind"])
    .where("isDeleted", "is not", 1)
    .orderBy("id")
)

const accountTransactionSourcesQuery = createQuery((db) =>
  db
    .selectFrom("accountTransactionSource")
    .select(["accountTransactionId", "source"])
    .where("isDeleted", "is not", 1)
    .orderBy("accountTransactionId")
)

const accountTransactionWithDetailsByIdQuery = (id: AccountTransactionId) =>
  createQuery((db) =>
    db
      .selectFrom("accountTransaction")
      .select((eb) => [
        "accountTransaction.id",
        "accountTransaction.accountId",
        "accountTransaction.amount",
        "accountTransaction.note",
        "accountTransaction.isDeleted",
        evoluJsonObjectFrom(
          eb
            .selectFrom("accountTransactionIban")
            .select([
              "accountTransactionIban.variableSymbol",
              "accountTransactionIban.specificSymbol",
              "accountTransactionIban.bankReference",
            ])
            .whereRef("accountTransactionIban.id", "=", "accountTransaction.id")
        ).as("iban"),
        evoluJsonObjectFrom(
          eb
            .selectFrom("accountTransactionSpark")
            .leftJoin("accountTransactionLightning", (join) =>
              join
                .onRef(
                  "accountTransactionLightning.id",
                  "=",
                  "accountTransactionSpark.id"
                )
                .on("accountTransactionLightning.isDeleted", "is not", 1)
            )
            .leftJoin("accountTransactionSparkInvoice", (join) =>
              join
                .onRef(
                  "accountTransactionSparkInvoice.id",
                  "=",
                  "accountTransactionSpark.id"
                )
                .on("accountTransactionSparkInvoice.isDeleted", "is not", 1)
            )
            .select([
              "accountTransactionSpark.sparkTransferId",
              "accountTransactionLightning.lnInvoice",
              "accountTransactionSparkInvoice.sparkInvoice",
            ])
            .whereRef(
              "accountTransactionSpark.id",
              "=",
              "accountTransaction.id"
            )
        ).as("spark"),
      ])
      .where("accountTransaction.id", "=", id)
  )

describe("account transaction actions", () => {
  test("reuses the same Evolu id for the same Spark transfer", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = createDeps(evolu)
    await using run = testCreateRun(deps)
    const accountId = await run.ok(
      createAccount({
        deviceId: null,
        name: NonEmptyString255("Spark account"),
        spark: {
          secret: SparkSecret("42373a7543db65ae0228ead6c9cbffcc"),
        },
      })
    )

    const firstId = await run.ok(
      createAccountTransaction({
        accountId,
        amount: Integer(1000),
        currency: "BTC",
        occurredAt: Date.parse("2026-05-27T10:00:00.000Z"),
        note: null,
        internalTransferGroupId: null,
        source: {
          deviceId: null,
          source: "manual",
        },
        spark: {
          sparkTransferId: NonEmptyStringSchema.decode("spark-transfer-1"),
          lightning: {
            lnInvoice: NonEmptyStringSchema.decode("lnbc1invoice"),
            preImage: NonEmptyStringSchema.decode("preimage-1"),
            paymentHash: NonEmptyStringSchema.decode("payment-hash-1"),
          },
        },
      })
    )
    const secondId = await run.ok(
      createAccountTransaction({
        accountId,
        amount: Integer(1000),
        currency: "BTC",
        occurredAt: Date.parse("2026-05-27T10:00:00.000Z"),
        note: null,
        internalTransferGroupId: null,
        source: {
          deviceId: null,
          source: "manual",
        },
        spark: {
          sparkTransferId: NonEmptyStringSchema.decode("spark-transfer-1"),
          lightning: {
            lnInvoice: NonEmptyStringSchema.decode("lnbc1invoice"),
            preImage: NonEmptyStringSchema.decode("preimage-1"),
            paymentHash: NonEmptyStringSchema.decode("payment-hash-1"),
          },
        },
      })
    )

    expect(secondId).toBe(firstId)
    await expect
      .poll(() => evolu.loadQuery(accountTransactionsQuery))
      .toEqual([
        {
          id: firstId,
          accountId,
          amount: 1000,
          kind: "spark",
        },
      ])
  })

  test("reuses the same Evolu id for the same IBAN bank reference in one account", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = createDeps(evolu)
    await using run = testCreateRun(deps)
    const accountId = await run.ok(
      createAccount({
        deviceId: null,
        name: NonEmptyString255("Bank account"),
        iban: {
          iban: IbanSchema.decode("CZ6508000000192000145399"),
          currency: "CZK",
        },
      })
    )

    const firstId = await run.ok(
      createAccountTransaction({
        accountId,
        amount: Integer(19950),
        currency: "CZK",
        occurredAt: Date.parse("2026-05-26T00:00:00.000Z"),
        note: null,
        internalTransferGroupId: null,
        source: {
          deviceId: null,
          source: "manual",
        },
        iban: {
          variableSymbol: null,
          constantSymbol: null,
          specificSymbol: null,
          bankReference: NonEmptyString255("123456789"),
        },
      })
    )
    const secondId = await run.ok(
      createAccountTransaction({
        accountId,
        amount: Integer(19950),
        currency: "CZK",
        occurredAt: Date.parse("2026-05-26T00:00:00.000Z"),
        note: null,
        internalTransferGroupId: null,
        source: {
          deviceId: null,
          source: "manual",
        },
        iban: {
          variableSymbol: null,
          constantSymbol: null,
          specificSymbol: null,
          bankReference: NonEmptyString255("123456789"),
        },
      })
    )

    expect(secondId).toBe(firstId)
    await expect
      .poll(() => evolu.loadQuery(accountTransactionsQuery))
      .toEqual([
        {
          id: firstId,
          accountId,
          amount: 19950,
          kind: "iban",
        },
      ])
    await expect
      .poll(() => evolu.loadQuery(accountTransactionSourcesQuery))
      .toEqual([
        {
          accountTransactionId: firstId,
          source: "manual",
        },
      ])
  })

  test("records automatic source for imported IBAN transactions", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = createDeps(evolu)
    await using run = testCreateRun(deps)
    const accountId = await run.ok(
      createAccount({
        deviceId: null,
        name: NonEmptyString255("Bank account"),
        iban: {
          iban: IbanSchema.decode("CZ6508000000192000145399"),
          currency: "CZK",
        },
      })
    )

    const id = await run.ok(
      createAccountTransaction({
        accountId,
        amount: Integer(19950),
        currency: "CZK",
        occurredAt: Date.parse("2026-05-26T00:00:00.000Z"),
        note: null,
        internalTransferGroupId: null,
        source: {
          deviceId: null,
          source: "auto",
        },
        iban: {
          variableSymbol: null,
          constantSymbol: null,
          specificSymbol: null,
          bankReference: NonEmptyString255("123456789"),
        },
      })
    )

    await expect
      .poll(() => evolu.loadQuery(accountTransactionSourcesQuery))
      .toEqual([
        {
          accountTransactionId: id,
          source: "auto",
        },
      ])
  })

  test("creates separate manual IBAN transactions without bank reference", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = createDeps(evolu)
    await using run = testCreateRun(deps)
    const accountId = await run.ok(
      createAccount({
        deviceId: null,
        name: NonEmptyString255("Bank account"),
        iban: {
          iban: IbanSchema.decode("CZ6508000000192000145399"),
          currency: "CZK",
        },
      })
    )

    const firstId = await run.ok(
      createAccountTransaction({
        accountId,
        amount: Integer(19950),
        currency: "CZK",
        occurredAt: Date.parse("2026-05-26T00:00:00.000Z"),
        note: null,
        internalTransferGroupId: null,
        source: {
          deviceId: null,
          source: "manual",
        },
        iban: {
          variableSymbol: VariableSymbol("123456"),
          constantSymbol: null,
          specificSymbol: null,
        },
      })
    )
    const secondId = await run.ok(
      createAccountTransaction({
        accountId,
        amount: Integer(19950),
        currency: "CZK",
        occurredAt: Date.parse("2026-05-26T00:00:00.000Z"),
        note: null,
        internalTransferGroupId: null,
        source: {
          deviceId: null,
          source: "manual",
        },
        iban: {
          variableSymbol: VariableSymbol("123456"),
          constantSymbol: null,
          specificSymbol: null,
        },
      })
    )

    expect(secondId).not.toBe(firstId)
    const expectedTransactions = [
      {
        id: firstId,
        accountId,
        amount: 19950,
        kind: "iban",
      },
      {
        id: secondId,
        accountId,
        amount: 19950,
        kind: "iban",
      },
    ].toSorted((left, right) => left.id.localeCompare(right.id))

    await expect
      .poll(async () =>
        (await evolu.loadQuery(accountTransactionsQuery)).toSorted(
          (left, right) => left.id.localeCompare(right.id)
        )
      )
      .toEqual(expectedTransactions)
    await expect
      .poll(async () =>
        (await evolu.loadQuery(accountTransactionSourcesQuery)).toSorted(
          (left, right) => {
            if (
              left.accountTransactionId === null ||
              right.accountTransactionId === null
            ) {
              throw new Error("accountTransactionId must not be null")
            }
            return left.accountTransactionId.localeCompare(
              right.accountTransactionId
            )
          }
        )
      )
      .toEqual(
        [
          {
            accountTransactionId: firstId,
            source: "manual",
          },
          {
            accountTransactionId: secondId,
            source: "manual",
          },
        ].toSorted((left, right) =>
          left.accountTransactionId.localeCompare(right.accountTransactionId)
        )
      )
  })

  test("keeps kind when updating without a detail payload", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = createDeps(evolu)
    await using run = testCreateRun(deps)
    const accountId = await run.ok(
      createAccount({
        deviceId: null,
        name: NonEmptyString255("Bank account"),
        iban: {
          iban: IbanSchema.decode("CZ6508000000192000145399"),
          currency: "CZK",
        },
      })
    )

    const id = await run.ok(
      createAccountTransaction({
        accountId,
        amount: Integer(19950),
        currency: "CZK",
        occurredAt: Date.parse("2026-05-26T00:00:00.000Z"),
        note: null,
        internalTransferGroupId: null,
        source: {
          deviceId: null,
          source: "manual",
        },
        iban: {
          variableSymbol: null,
          constantSymbol: null,
          specificSymbol: null,
          bankReference: NonEmptyString255("123456789"),
        },
      })
    )

    await run.ok(
      updateAccountTransaction({
        id,
        note: NonEmptyStringSchema.decode("Updated note"),
      })
    )

    await expect
      .poll(() => evolu.loadQuery(accountTransactionsQuery))
      .toEqual([
        {
          id,
          accountId,
          amount: 19950,
          kind: "iban",
        },
      ])
  })

  test("scopes IBAN bank reference ids by account", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = createDeps(evolu)
    await using run = testCreateRun(deps)
    const firstAccountId = await run.ok(
      createAccount({
        deviceId: null,
        name: NonEmptyString255("First bank account"),
        iban: {
          iban: IbanSchema.decode("CZ6508000000192000145399"),
          currency: "CZK",
        },
      })
    )
    const secondAccountId = await run.ok(
      createAccount({
        deviceId: null,
        name: NonEmptyString255("Second bank account"),
        iban: {
          iban: IbanSchema.decode("CZ5508000000001234567899"),
          currency: "CZK",
        },
      })
    )

    const firstId = await run.ok(
      createAccountTransaction({
        accountId: firstAccountId,
        amount: Integer(1000),
        currency: "CZK",
        occurredAt: Date.parse("2026-05-26T00:00:00.000Z"),
        note: null,
        internalTransferGroupId: null,
        source: {
          deviceId: null,
          source: "manual",
        },
        iban: {
          variableSymbol: null,
          constantSymbol: null,
          specificSymbol: null,
          bankReference: NonEmptyString255("123456789"),
        },
      })
    )
    const secondId = await run.ok(
      createAccountTransaction({
        accountId: secondAccountId,
        amount: Integer(2000),
        currency: "CZK",
        occurredAt: Date.parse("2026-05-26T00:00:00.000Z"),
        note: null,
        internalTransferGroupId: null,
        source: {
          deviceId: null,
          source: "manual",
        },
        iban: {
          variableSymbol: null,
          constantSymbol: null,
          specificSymbol: null,
          bankReference: NonEmptyString255("123456789"),
        },
      })
    )

    expect(secondId).not.toBe(firstId)
    const expectedTransactions = [
      {
        id: firstId,
        accountId: firstAccountId,
        amount: 1000,
        kind: "iban",
      },
      {
        id: secondId,
        accountId: secondAccountId,
        amount: 2000,
        kind: "iban",
      },
    ].toSorted((left, right) => left.accountId.localeCompare(right.accountId))

    await expect
      .poll(async () =>
        (await evolu.loadQuery(accountTransactionsQuery)).toSorted(
          (left, right) => {
            if (left.accountId === null || right.accountId === null) {
              throw new Error("accountId must not be null")
            }
            return left.accountId.localeCompare(right.accountId)
          }
        )
      )
      .toEqual(expectedTransactions)
  })

  test("updates an IBAN transaction's top-level and detail fields", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = createDeps(evolu)
    await using run = testCreateRun(deps)
    const accountId = await run.ok(
      createAccount({
        deviceId: null,
        name: NonEmptyString255("Bank account"),
        iban: {
          iban: IbanSchema.decode("CZ6508000000192000145399"),
          currency: "CZK",
        },
      })
    )

    const id = await run.ok(
      createAccountTransaction({
        accountId,
        amount: Integer(19950),
        currency: "CZK",
        occurredAt: Date.parse("2026-05-26T00:00:00.000Z"),
        note: null,
        internalTransferGroupId: null,
        source: {
          deviceId: null,
          source: "manual",
        },
        iban: {
          variableSymbol: VariableSymbol("1111111111"),
          constantSymbol: null,
          specificSymbol: null,
          bankReference: NonEmptyString255("123456789"),
        },
      })
    )

    await expect(
      run.ok(
        updateAccountTransaction({
          id,
          amount: Integer(20000),
          note: NonEmptyStringSchema.decode("Updated note"),
          iban: {
            variableSymbol: VariableSymbol("2222222222"),
          },
        })
      )
    ).resolves.toBe(id)

    await expect
      .poll(() => evolu.loadQuery(accountTransactionWithDetailsByIdQuery(id)))
      .toMatchObject([
        {
          id,
          accountId,
          amount: 20000,
          note: "Updated note",
          iban: {
            variableSymbol: "2222222222",
            bankReference: "123456789",
          },
        },
      ])
  })

  test("updates a Spark transaction's sparkTransferId and lightning detail", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = createDeps(evolu)
    await using run = testCreateRun(deps)
    const accountId = await run.ok(
      createAccount({
        deviceId: null,
        name: NonEmptyString255("Spark account"),
        spark: {
          secret: SparkSecret("42373a7543db65ae0228ead6c9cbffcc"),
        },
      })
    )

    const id = await run.ok(
      createAccountTransaction({
        accountId,
        amount: Integer(1000),
        currency: "BTC",
        occurredAt: Date.parse("2026-05-27T10:00:00.000Z"),
        note: null,
        internalTransferGroupId: null,
        source: {
          deviceId: null,
          source: "manual",
        },
        spark: {
          sparkTransferId: NonEmptyStringSchema.decode("spark-transfer-1"),
          lightning: {
            lnInvoice: NonEmptyStringSchema.decode("lnbc1invoice"),
            preImage: NonEmptyStringSchema.decode("preimage-1"),
            paymentHash: NonEmptyStringSchema.decode("payment-hash-1"),
          },
        },
      })
    )

    await expect(
      run.ok(
        updateAccountTransaction({
          id,
          spark: {
            sparkTransferId: NonEmptyStringSchema.decode("spark-transfer-2"),
            lightning: {
              lnInvoice: NonEmptyStringSchema.decode("lnbc2invoice"),
            },
          },
        })
      )
    ).resolves.toBe(id)

    await expect
      .poll(() => evolu.loadQuery(accountTransactionWithDetailsByIdQuery(id)))
      .toMatchObject([
        {
          id,
          spark: {
            sparkTransferId: "spark-transfer-2",
            lnInvoice: "lnbc2invoice",
          },
        },
      ])
  })

  test("deletes an account transaction by soft-deleting it", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    const deps = createDeps(evolu)
    await using run = testCreateRun(deps)
    const accountId = await run.ok(
      createAccount({
        deviceId: null,
        name: NonEmptyString255("Bank account"),
        iban: {
          iban: IbanSchema.decode("CZ6508000000192000145399"),
          currency: "CZK",
        },
      })
    )

    const id = await run.ok(
      createAccountTransaction({
        accountId,
        amount: Integer(19950),
        currency: "CZK",
        occurredAt: Date.parse("2026-05-26T00:00:00.000Z"),
        note: null,
        internalTransferGroupId: null,
        source: {
          deviceId: null,
          source: "manual",
        },
        iban: {
          variableSymbol: null,
          constantSymbol: null,
          specificSymbol: null,
          bankReference: NonEmptyString255("123456789"),
        },
      })
    )

    await expect(run.ok(deleteAccountTransaction(id))).resolves.toBe(id)

    await expect
      .poll(() => evolu.loadQuery(accountTransactionWithDetailsByIdQuery(id)))
      .toMatchObject([
        {
          id,
          isDeleted: sqliteTrue,
        },
      ])
  })
})
