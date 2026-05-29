import { testCreateRun } from "@evolu/common"
import { describe, expect, test } from "vitest"

import { createEvoluTest } from "@/core/evolu/cli-client.ts"
import { createQuery } from "@/core/evolu/schema.ts"
import { createAccount } from "@/core/modules/account/account-actions.ts"
import { createAccountTransaction } from "./account-transaction-actions.ts"

const accountTransactionsQuery = createQuery((db) =>
  db
    .selectFrom("accountTransaction")
    .select(["id", "accountId", "amount", "kind"])
    .where("isDeleted", "is not", 1)
    .orderBy("id")
)

describe("account transaction actions", () => {
  test("reuses the same Evolu id for the same Spark transfer", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    await using run = testCreateRun({ evolu })
    const accountId = await run.orThrow(
      createAccount({
        deviceId: null,
        name: "Spark account",
        spark: {
          mnemonic: "spark mnemonic",
        },
      })
    )

    const firstId = await run.orThrow(
      createAccountTransaction({
        deviceId: null,
        accountId,
        amount: 1000,
        currency: "BTC",
        occurredAt: Date.parse("2026-05-27T10:00:00.000Z"),
        note: null,
        internalTransferGroupId: null,
        spark: {
          sparkTransferId: "spark-transfer-1",
          lnInvoice: "lnbc1invoice",
          preImage: "preimage-1",
          paymentHash: "payment-hash-1",
        },
      })
    )
    const secondId = await run.orThrow(
      createAccountTransaction({
        deviceId: null,
        accountId,
        amount: 1000,
        currency: "BTC",
        occurredAt: Date.parse("2026-05-27T10:00:00.000Z"),
        note: null,
        internalTransferGroupId: null,
        spark: {
          sparkTransferId: "spark-transfer-1",
          lnInvoice: "lnbc1invoice",
          preImage: "preimage-1",
          paymentHash: "payment-hash-1",
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
    await using run = testCreateRun({ evolu })
    const accountId = await run.orThrow(
      createAccount({
        deviceId: null,
        name: "Bank account",
        iban: {
          iban: "CZ6508000000192000145399",
          currency: "CZK",
        },
      })
    )

    const firstId = await run.orThrow(
      createAccountTransaction({
        deviceId: null,
        accountId,
        amount: 19950,
        currency: "CZK",
        occurredAt: Date.parse("2026-05-26T00:00:00.000Z"),
        note: null,
        internalTransferGroupId: null,
        iban: {
          variableSymbol: null,
          constantSymbol: null,
          specificSymbol: null,
          bankReference: "123456789",
        },
      })
    )
    const secondId = await run.orThrow(
      createAccountTransaction({
        deviceId: null,
        accountId,
        amount: 19950,
        currency: "CZK",
        occurredAt: Date.parse("2026-05-26T00:00:00.000Z"),
        note: null,
        internalTransferGroupId: null,
        iban: {
          variableSymbol: null,
          constantSymbol: null,
          specificSymbol: null,
          bankReference: "123456789",
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
  })

  test("scopes IBAN bank reference ids by account", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    await using run = testCreateRun({ evolu })
    const firstAccountId = await run.orThrow(
      createAccount({
        deviceId: null,
        name: "First bank account",
        iban: {
          iban: "CZ6508000000192000145399",
          currency: "CZK",
        },
      })
    )
    const secondAccountId = await run.orThrow(
      createAccount({
        deviceId: null,
        name: "Second bank account",
        iban: {
          iban: "CZ2408000000001234567899",
          currency: "CZK",
        },
      })
    )

    const firstId = await run.orThrow(
      createAccountTransaction({
        deviceId: null,
        accountId: firstAccountId,
        amount: 1000,
        currency: "CZK",
        occurredAt: Date.parse("2026-05-26T00:00:00.000Z"),
        note: null,
        internalTransferGroupId: null,
        iban: {
          variableSymbol: null,
          constantSymbol: null,
          specificSymbol: null,
          bankReference: "123456789",
        },
      })
    )
    const secondId = await run.orThrow(
      createAccountTransaction({
        deviceId: null,
        accountId: secondAccountId,
        amount: 2000,
        currency: "CZK",
        occurredAt: Date.parse("2026-05-26T00:00:00.000Z"),
        note: null,
        internalTransferGroupId: null,
        iban: {
          variableSymbol: null,
          constantSymbol: null,
          specificSymbol: null,
          bankReference: "123456789",
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
          (left, right) => left.accountId.localeCompare(right.accountId)
        )
      )
      .toEqual(expectedTransactions)
  })
})
