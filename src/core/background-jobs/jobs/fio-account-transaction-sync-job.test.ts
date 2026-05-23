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
import type { FioPluginId } from "@/core/modules/fio-plugin/fio-plugin-types.ts"
import { DateStringSchema } from "@/core/modules/shared/schema.ts"
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

const fioPluginSyncPointerQuery = (fioPluginId: FioPluginId) =>
  createQuery((db) =>
    db
      .selectFrom("fioPluginSyncPointer")
      .select(["id", "lastSyncedDate"])
      .where("id", "=", fioPluginId)
      .where("isDeleted", "is", null)
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
    const fioPluginId = await run.orThrow(
      createFioPlugin({
        accountId,
        numberOfSecondsBetweenChecks: 60,
        syncLookbackDays: 1,
        isActive: sqliteTrue,
        token: "fio-token-1",
      })
    )
    await using jobRun = testCreateRun({
      console: testCreateConsole(),
      evolu,
      evoluOwnerId: evolu.appOwner.id,
      onError: (error) => {
        errors.push(error)
      },
      fetch: async (input) => {
        requestedUrls.push(inputToString(input))
        return statementResponse({
          transactions: [fioTransaction, fioTransaction],
        })
      },
      date: {
        now: () => new Date("2026-05-31T10:00:00.000Z"),
      },
    })
    await using _job = await jobRun.orThrow(
      createFioAccountTransactionSyncJob()
    )

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
      "https://fioapi.fio.cz/v1/rest/periods/fio-token-1/2026-03-31/2026-05-31/transactions.json",
    ])
    expect(
      await evolu.loadQuery(fioPluginSyncPointerQuery(fioPluginId))
    ).toEqual([
      {
        id: fioPluginId,
        lastSyncedDate: "2026-05-31",
      },
    ])
    expect(errors).toEqual([])
  })

  test("uses local sync pointer and configured lookback for the next period", async () => {
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
        numberOfSecondsBetweenChecks: 60,
        syncLookbackDays: 3,
        isActive: sqliteTrue,
        token: "fio-token-1",
      })
    )
    evolu.upsert(
      "fioPluginSyncPointer",
      {
        id: fioPluginId,
        lastSyncedDate: DateStringSchema.decode("2026-05-20"),
      },
      { ownerId: evolu.appOwner.id }
    )
    await using jobRun = testCreateRun({
      console: testCreateConsole(),
      evolu,
      evoluOwnerId: evolu.appOwner.id,
      onError: (error) => {
        errors.push(error)
      },
      fetch: async (input) => {
        requestedUrls.push(inputToString(input))
        return statementResponse({
          transactions: [fioTransaction],
        })
      },
      date: {
        now: () => new Date("2026-05-31T10:00:00.000Z"),
      },
    })
    await using _job = await jobRun.orThrow(
      createFioAccountTransactionSyncJob()
    )

    await expect
      .poll(() => evolu.loadQuery(ibanTransactionsByAccountIdQuery(accountId)))
      .toHaveLength(1)

    expect(requestedUrls).toEqual([
      "https://fioapi.fio.cz/v1/rest/periods/fio-token-1/2026-05-17/2026-05-31/transactions.json",
    ])
    expect(
      await evolu.loadQuery(fioPluginSyncPointerQuery(fioPluginId))
    ).toEqual([
      {
        id: fioPluginId,
        lastSyncedDate: "2026-05-31",
      },
    ])
    expect(errors).toEqual([])
  })

  test("logs FIO rate limiting without reporting a job error", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    await using run = testCreateRun({ evolu })
    const errors: unknown[] = []
    const console = testCreateConsole()
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
        numberOfSecondsBetweenChecks: 60,
        isActive: sqliteTrue,
        token: "fio-token-1",
      })
    )
    await using jobRun = testCreateRun({
      console,
      evolu,
      evoluOwnerId: evolu.appOwner.id,
      onError: (error) => {
        errors.push(error)
      },
      fetch: async () =>
        new Response("Interval between requests was not respected.", {
          status: 409,
        }),
      date: {
        now: () => new Date("2026-05-31T10:00:00.000Z"),
      },
    })
    await using _job = await jobRun.orThrow(
      createFioAccountTransactionSyncJob()
    )

    await expect
      .poll(() => console.getEntriesSnapshot())
      .toContainEqual({
        method: "error",
        path: ["fio-account-transaction-sync-job"],
        args: [
          "Skipped FIO sync because of rate limiting.",
          {
            accountId,
            pluginId: fioPluginId,
            responseBody: "Interval between requests was not respected.",
          },
        ],
      })
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
      evoluOwnerId: evolu.appOwner.id,
      onError: (error) => {
        errors.push(error)
      },
      fetch: async (input) => {
        requestedUrls.push(inputToString(input))
        return statementResponse({
          transactions: [],
        })
      },
      date: {
        now: () => new Date("2026-05-31T10:00:00.000Z"),
      },
    })
    await using _job = await jobRun.orThrow(
      createFioAccountTransactionSyncJob()
    )

    await expect
      .poll(() => requestedUrls.length, { timeout: 3_000 })
      .toBeGreaterThanOrEqual(2)

    expect(requestedUrls.slice(0, 2)).toEqual([
      "https://fioapi.fio.cz/v1/rest/periods/fio-token-1/2026-03-31/2026-05-31/transactions.json",
      "https://fioapi.fio.cz/v1/rest/periods/fio-token-2/2026-05-30/2026-05-31/transactions.json",
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
      evoluOwnerId: evolu.appOwner.id,
      onError: (error) => {
        errors.push(error)
      },
      fetch: async () =>
        statementResponse({
          iban: "CZ2408000000001234567899",
          transactions: [fioTransaction],
        }),
      date: {
        now: () => new Date("2026-05-31T10:00:00.000Z"),
      },
    })
    await using _job = await jobRun.orThrow(
      createFioAccountTransactionSyncJob()
    )

    await new Promise((resolve) => setTimeout(resolve, 50))

    expect(
      await evolu.loadQuery(ibanTransactionsByAccountIdQuery(accountId))
    ).toEqual([])
    expect(errors).toEqual([])
  })
})
