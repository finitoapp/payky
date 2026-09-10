import { sqliteTrue, testCreateConsole, testCreateRun } from "@evolu/common"
import { describe, expect, test } from "vitest"

import { createInProcessLockManager } from "@/core/cli/in-process-lock-manager.ts"
import { createEvoluTest } from "@/core/evolu/cli-client.ts"
import { createQuery } from "@/core/evolu/schema.ts"
import { createAccount } from "@/core/modules/account/account-actions.ts"
import type { AccountId } from "@/core/modules/account/account-types.ts"
import {
  addFioPluginToken,
  createFioPlugin,
  deleteFioPluginToken,
} from "@/core/modules/fio-plugin/fio-plugin-actions.ts"
import type { FioPluginId } from "@/core/modules/fio-plugin/fio-plugin-types.ts"
import {
  DateStringSchema,
  IbanSchema,
  NonEmptyString255,
  PositiveInteger,
} from "@/core/modules/shared/schema.ts"
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
    await using run = testCreateRun({ evolu, evoluOwnerId: evolu.appOwner.id })
    const errors: unknown[] = []
    const requestedUrls: string[] = []
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
    const fioPluginId = await run.ok(
      createFioPlugin({
        accountId,
        numberOfSecondsBetweenChecks: PositiveInteger(60),
        syncLookbackDays: PositiveInteger(1),
        isActive: sqliteTrue,
      })
    )
    await run.ok(
      addFioPluginToken({
        fioPluginId,
        token: NonEmptyString255("fio-token-1"),
      })
    )
    await using jobRun = testCreateRun({
      console: testCreateConsole(),
      evolu,
      evoluOwnerId: evolu.appOwner.id,
      lockManager: createInProcessLockManager(),
      onError: (error: unknown) => {
        errors.push(error)
      },
      fetch: async (input: RequestInfo | URL) => {
        requestedUrls.push(inputToString(input))
        return statementResponse({
          transactions: [fioTransaction, fioTransaction],
        })
      },
      date: {
        now: () => new Date("2026-05-31T10:00:00.000Z"),
      },
    })
    await using _job = await jobRun.ok(createFioAccountTransactionSyncJob())

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
    await expect
      .poll(() => evolu.loadQuery(fioPluginSyncPointerQuery(fioPluginId)))
      .toEqual([
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
    await using run = testCreateRun({ evolu, evoluOwnerId: evolu.appOwner.id })
    const errors: unknown[] = []
    const requestedUrls: string[] = []
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
    const fioPluginId = await run.ok(
      createFioPlugin({
        accountId,
        numberOfSecondsBetweenChecks: PositiveInteger(60),
        syncLookbackDays: PositiveInteger(3),
        isActive: sqliteTrue,
      })
    )
    await run.ok(
      addFioPluginToken({
        fioPluginId,
        token: NonEmptyString255("fio-token-1"),
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
      lockManager: createInProcessLockManager(),
      onError: (error: unknown) => {
        errors.push(error)
      },
      fetch: async (input: RequestInfo | URL) => {
        requestedUrls.push(inputToString(input))
        return statementResponse({
          transactions: [fioTransaction],
        })
      },
      date: {
        now: () => new Date("2026-05-31T10:00:00.000Z"),
      },
    })
    await using _job = await jobRun.ok(createFioAccountTransactionSyncJob())

    await expect
      .poll(() => evolu.loadQuery(ibanTransactionsByAccountIdQuery(accountId)))
      .toHaveLength(1)

    expect(requestedUrls).toEqual([
      "https://fioapi.fio.cz/v1/rest/periods/fio-token-1/2026-05-17/2026-05-31/transactions.json",
    ])
    // Polled, like the same assertion earlier in this file: the job advances
    // the sync pointer in a mutation of its own, so waiting for the imported
    // transaction says nothing about the pointer having landed yet.
    await expect
      .poll(() => evolu.loadQuery(fioPluginSyncPointerQuery(fioPluginId)))
      .toEqual([
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
    await using run = testCreateRun({ evolu, evoluOwnerId: evolu.appOwner.id })
    const errors: unknown[] = []
    const console = testCreateConsole()
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
    const fioPluginId = await run.ok(
      createFioPlugin({
        accountId,
        numberOfSecondsBetweenChecks: PositiveInteger(60),
        isActive: sqliteTrue,
      })
    )
    await run.ok(
      addFioPluginToken({
        fioPluginId,
        token: NonEmptyString255("fio-token-1"),
      })
    )
    await using jobRun = testCreateRun({
      console,
      evolu,
      evoluOwnerId: evolu.appOwner.id,
      lockManager: createInProcessLockManager(),
      onError: (error: unknown) => {
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
    await using _job = await jobRun.ok(createFioAccountTransactionSyncJob())

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
    await using run = testCreateRun({ evolu, evoluOwnerId: evolu.appOwner.id })
    const errors: unknown[] = []
    const requestedUrls: string[] = []
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
    const fioPluginId = await run.ok(
      createFioPlugin({
        accountId,
        numberOfSecondsBetweenChecks: PositiveInteger(1),
        isActive: sqliteTrue,
      })
    )
    await run.ok(
      addFioPluginToken({
        fioPluginId,
        token: NonEmptyString255("fio-token-1"),
      })
    )
    await run.ok(
      addFioPluginToken({
        fioPluginId,
        token: NonEmptyString255("fio-token-2"),
      })
    )
    await using jobRun = testCreateRun({
      console: testCreateConsole(),
      evolu,
      evoluOwnerId: evolu.appOwner.id,
      lockManager: createInProcessLockManager(),
      onError: (error: unknown) => {
        errors.push(error)
      },
      fetch: async (input: RequestInfo | URL) => {
        requestedUrls.push(inputToString(input))
        return statementResponse({
          transactions: [],
        })
      },
      date: {
        now: () => new Date("2026-05-31T10:00:00.000Z"),
      },
    })
    await using _job = await jobRun.ok(createFioAccountTransactionSyncJob())

    await expect
      .poll(() => requestedUrls.length, { timeout: 3_000 })
      .toBeGreaterThanOrEqual(2)

    expect(requestedUrls.slice(0, 2)).toEqual([
      "https://fioapi.fio.cz/v1/rest/periods/fio-token-1/2026-03-31/2026-05-31/transactions.json",
      "https://fioapi.fio.cz/v1/rest/periods/fio-token-2/2026-05-30/2026-05-31/transactions.json",
    ])
    expect(errors).toEqual([])
  })

  test("switches to a replacement token set without restarting the job", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    await using run = testCreateRun({ evolu, evoluOwnerId: evolu.appOwner.id })
    const errors: unknown[] = []
    const requestedUrls: string[] = []
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
    const fioPluginId = await run.ok(
      createFioPlugin({
        accountId,
        numberOfSecondsBetweenChecks: PositiveInteger(1),
        isActive: sqliteTrue,
      })
    )
    const staleTokenId = await run.ok(
      addFioPluginToken({
        fioPluginId,
        token: NonEmptyString255("fio-token-stale"),
      })
    )
    await using jobRun = testCreateRun({
      console: testCreateConsole(),
      evolu,
      evoluOwnerId: evolu.appOwner.id,
      lockManager: createInProcessLockManager(),
      onError: (error: unknown) => {
        errors.push(error)
      },
      fetch: async (input: RequestInfo | URL) => {
        requestedUrls.push(inputToString(input))
        return statementResponse({ transactions: [] })
      },
      date: {
        now: () => new Date("2026-05-31T10:00:00.000Z"),
      },
    })
    await using _job = await jobRun.ok(createFioAccountTransactionSyncJob())

    await expect
      .poll(() => requestedUrls.length, { timeout: 3_000 })
      .toBeGreaterThanOrEqual(1)
    expect(requestedUrls[0]).toContain("fio-token-stale")

    // The token is rotated the way the settings UI does it: add the new one,
    // remove the old. The job subscribes to `activeFioPluginsQuery` and
    // `FioPluginSync.matches` compares the token set, so its session — and
    // with it the `createFioApiDep` rotation — must be rebuilt around the
    // replacement. Before tokens were managed separately, the old one stayed
    // in the set and the job kept retrying a revoked token forever.
    await run.ok(
      addFioPluginToken({
        fioPluginId,
        token: NonEmptyString255("fio-token-fresh"),
      })
    )
    await run.ok(deleteFioPluginToken(staleTokenId))

    const staleRequestsAtRotation = requestedUrls.filter((url) =>
      url.includes("fio-token-stale")
    ).length

    await expect
      .poll(
        () => requestedUrls.some((url) => url.includes("fio-token-fresh")),
        {
          timeout: 5_000,
        }
      )
      .toBe(true)

    // And nothing went back to the revoked token after it was removed.
    expect(
      requestedUrls.filter((url) => url.includes("fio-token-stale")).length
    ).toBe(staleRequestsAtRotation)
    expect(errors).toEqual([])
  }, 20_000)

  test("skips statements for a different IBAN", async () => {
    await using testEvolu = await createEvoluTest()
    const { evolu } = testEvolu
    await using run = testCreateRun({ evolu, evoluOwnerId: evolu.appOwner.id })
    const errors: unknown[] = []
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
    const fioPluginId = await run.ok(
      createFioPlugin({
        accountId,
        numberOfSecondsBetweenChecks: PositiveInteger(60),
        isActive: sqliteTrue,
      })
    )
    await run.ok(
      addFioPluginToken({
        fioPluginId,
        token: NonEmptyString255("fio-token-1"),
      })
    )
    await using jobRun = testCreateRun({
      console: testCreateConsole(),
      evolu,
      evoluOwnerId: evolu.appOwner.id,
      lockManager: createInProcessLockManager(),
      onError: (error: unknown) => {
        errors.push(error)
      },
      fetch: async () =>
        statementResponse({
          iban: "CZ5508000000001234567899",
          transactions: [fioTransaction],
        }),
      date: {
        now: () => new Date("2026-05-31T10:00:00.000Z"),
      },
    })
    await using _job = await jobRun.ok(createFioAccountTransactionSyncJob())

    await new Promise((resolve) => setTimeout(resolve, 50))

    expect(
      await evolu.loadQuery(ibanTransactionsByAccountIdQuery(accountId))
    ).toEqual([])
    expect(errors).toEqual([])
  })
})
