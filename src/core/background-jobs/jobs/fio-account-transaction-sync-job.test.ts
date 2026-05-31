import { sqliteTrue, testCreateConsole, testCreateRun } from "@evolu/common"
import { describe, expect, test } from "vitest"

import { createEvoluTest } from "@/core/evolu/cli-client.ts"
import { createQuery } from "@/core/evolu/schema.ts"
import { createAccount } from "@/core/modules/account/account-actions.ts"
import type { AccountId } from "@/core/modules/account/account-types.ts"
import {
  createFioPlugin,
  updateFioPlugin,
} from "@/core/modules/fio-plugin/fio-plugin-actions.ts"
import { createFioAccountTransactionSyncJob } from "./fio-account-transaction-sync-job.ts"

const ibanTransactionsByAccountIdQuery = (accountId: AccountId) =>
  createQuery((db) =>
    db
      .selectFrom("accountTransaction")
      .innerJoin(
        "accountTransactionIban",
        "accountTransactionIban.id",
        "accountTransaction.id"
      )
      .select([
        "accountTransaction.accountId",
        "accountTransaction.amount",
        "accountTransaction.currency",
        "accountTransaction.occurredAt",
        "accountTransaction.note",
        "accountTransactionIban.variableSymbol",
        "accountTransactionIban.constantSymbol",
        "accountTransactionIban.specificSymbol",
        "accountTransactionIban.bankReference",
      ])
      .where("accountTransaction.accountId", "=", accountId)
      .where("accountTransaction.isDeleted", "is not", 1)
  )

const fioTransaction = {
  column0: { value: 123456789, name: "ID pohybu" },
  column1: { value: "2026-05-26+02:00", name: "Datum" },
  column2: { value: "199.50", name: "Objem" },
  column3: { value: "CZK", name: "Měna" },
  column4: { value: "2600123456", name: "Protiúčet" },
  column5: { value: "Customer Ltd.", name: "Název protiúčtu" },
  column6: { value: "2010", name: "Kód banky" },
  column7: { value: "Fio banka, a.s.", name: "Název banky" },
  column8: { value: "0308", name: "KS" },
  column9: { value: "123456", name: "VS" },
  column10: { value: "789", name: "SS" },
  column11: { value: "Terminal 1", name: "Uživatelská identifikace" },
  column12: { value: "Thanks", name: "Zpráva pro příjemce" },
  column13: { value: "Bezhotovostní příjem", name: "Typ" },
}

const statementResponse = ({
  iban = "CZ6508000000192000145399",
  transactions,
}: {
  readonly iban?: string
  readonly transactions: unknown
}) =>
  new Response(
    JSON.stringify({
      accountStatement: {
        info: {
          iban,
          currency: "CZK",
        },
        transactionList: {
          transaction: transactions,
        },
      },
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    }
  )

const inputToString = (input: RequestInfo | URL): string =>
  input instanceof URL ? input.toString() : String(input)

describe("fio account transaction sync job", () => {
  test("downloads FIO transactions into IBAN account transactions without duplicates", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    await using run = testCreateRun({ evolu })
    const errors: unknown[] = []
    const requestedUrls: string[] = []
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
    await run.orThrow(
      createFioPlugin({
        accountId,
        numberOfSecondsBetweenChecks: 60,
        isActive: sqliteTrue,
        token: "fio-token-1",
      })
    )
    await using jobRun = testCreateRun({
      console: testCreateConsole(),
      evolu,
      onError: (error) => {
        errors.push(error)
      },
      fetch: async (input) => {
        requestedUrls.push(inputToString(input))
        return statementResponse({
          transactions: [fioTransaction, fioTransaction],
        })
      },
    })
    using _job = await jobRun.orThrow(createFioAccountTransactionSyncJob())

    await expect
      .poll(() => evolu.loadQuery(ibanTransactionsByAccountIdQuery(accountId)))
      .toEqual([
        {
          accountId,
          amount: 19950,
          currency: "CZK",
          occurredAt: Date.parse("2026-05-26T00:00:00.000Z"),
          note: "Customer Ltd. | Thanks | Terminal 1 | Bezhotovostní příjem",
          variableSymbol: "123456",
          constantSymbol: "0308",
          specificSymbol: "789",
          bankReference: "123456789",
        },
      ])

    expect(requestedUrls).toEqual([
      "https://fioapi.fio.cz/v1/rest/last/fio-token-1/transactions.json",
    ])
    expect(errors).toEqual([])
  })

  test("repairs an old FIO last-date cursor before retrying last transactions", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    await using run = testCreateRun({ evolu })
    const errors: unknown[] = []
    const requestedUrls: string[] = []
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
    await run.orThrow(
      createFioPlugin({
        accountId,
        numberOfSecondsBetweenChecks: 60,
        isActive: sqliteTrue,
        token: "fio-token-1",
      })
    )
    await using jobRun = testCreateRun({
      console: testCreateConsole(),
      evolu,
      onError: (error) => {
        errors.push(error)
      },
      fetch: async (input) => {
        requestedUrls.push(inputToString(input))
        if (requestedUrls.length === 1) {
          return new Response(
            "Data není možné poskytnout bez silné autorizace",
            { status: 422 }
          )
        }
        if (requestedUrls.length === 2) {
          return new Response(null, { status: 204 })
        }

        return statementResponse({
          transactions: [fioTransaction],
        })
      },
      date: {
        now: () => new Date("2026-05-31T10:00:00.000Z"),
      },
    })
    using _job = await jobRun.orThrow(createFioAccountTransactionSyncJob())

    await expect
      .poll(() => evolu.loadQuery(ibanTransactionsByAccountIdQuery(accountId)))
      .toHaveLength(1)

    expect(requestedUrls).toEqual([
      "https://fioapi.fio.cz/v1/rest/last/fio-token-1/transactions.json",
      "https://fioapi.fio.cz/v1/rest/set-last-date/fio-token-1/2026-03-31/",
      "https://fioapi.fio.cz/v1/rest/last/fio-token-1/transactions.json",
    ])
    expect(errors).toEqual([])
  })

  test("rotates FIO tokens between sync cycles", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    await using run = testCreateRun({ evolu })
    const errors: unknown[] = []
    const requestedUrls: string[] = []
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
    const fioPluginId = await run.orThrow(
      createFioPlugin({
        accountId,
        numberOfSecondsBetweenChecks: 1,
        isActive: sqliteTrue,
        token: "fio-token-1",
      })
    )
    await run.orThrow(
      updateFioPlugin({
        id: fioPluginId,
        token: "fio-token-2",
      })
    )
    await using jobRun = testCreateRun({
      console: testCreateConsole(),
      evolu,
      onError: (error) => {
        errors.push(error)
      },
      fetch: async (input) => {
        requestedUrls.push(inputToString(input))
        return statementResponse({
          transactions: [],
        })
      },
    })
    using _job = await jobRun.orThrow(createFioAccountTransactionSyncJob())

    await expect.poll(() => requestedUrls.length).toBeGreaterThanOrEqual(2)

    expect(requestedUrls.slice(0, 2)).toEqual([
      "https://fioapi.fio.cz/v1/rest/last/fio-token-1/transactions.json",
      "https://fioapi.fio.cz/v1/rest/last/fio-token-2/transactions.json",
    ])
    expect(errors).toEqual([])
  })

  test("skips statements for a different IBAN", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    await using run = testCreateRun({ evolu })
    const errors: unknown[] = []
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
    await run.orThrow(
      createFioPlugin({
        accountId,
        numberOfSecondsBetweenChecks: 60,
        isActive: sqliteTrue,
        token: "fio-token-1",
      })
    )
    await using jobRun = testCreateRun({
      console: testCreateConsole(),
      evolu,
      onError: (error) => {
        errors.push(error)
      },
      fetch: async () =>
        statementResponse({
          iban: "CZ2408000000001234567899",
          transactions: [fioTransaction],
        }),
    })
    using _job = await jobRun.orThrow(createFioAccountTransactionSyncJob())

    await new Promise((resolve) => setTimeout(resolve, 50))

    expect(
      await evolu.loadQuery(ibanTransactionsByAccountIdQuery(accountId))
    ).toEqual([])
    expect(errors).toEqual([])
  })
})
