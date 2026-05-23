import { testCreateRun } from "@evolu/common"
import { describe, expect, test } from "vitest"

import type { FetchDep } from "@/core/deps.ts"
import { DateStringSchema } from "@/core/modules/shared/schema.ts"
import {
  createFioApiDep,
  type FioApiDep,
  type FioRateLimitError,
  type FioStrongAuthorizationRequiredError,
  fetchFioLastTransactions,
  fetchFioTransactionsByPeriod,
  setFioLastDate,
} from "./fio-client.ts"

const dateString = DateStringSchema.parse

const transaction = {
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
  column14: { value: "ABC123", name: "ID pokynu" },
}

const statementResponse = (transactions: unknown) =>
  new Response(
    JSON.stringify({
      accountStatement: {
        info: {
          iban: "CZ6508000000192000145399",
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

describe("fio client", () => {
  test("downloads and normalizes last transactions", async () => {
    const requestedUrls: string[] = []
    const deps = {
      ...createFioApiDep({
        tokens: ["token-a"],
        baseUrl: "https://example.test",
      }),
      fetch: async (input) => {
        requestedUrls.push(inputToString(input))
        return statementResponse([transaction])
      },
    } satisfies FioApiDep & FetchDep
    await using run = testCreateRun(deps)

    await expect(run(fetchFioLastTransactions())).resolves.toMatchObject({
      ok: true,
      value: {
        iban: "CZ6508000000192000145399",
        currency: "CZK",
        transactions: [
          {
            id: "123456789",
            bookedDate: "2026-05-26",
            amountMinor: 19950,
            currency: "CZK",
            counterAccountNumber: "2600123456",
            counterAccountName: "Customer Ltd.",
            counterBankCode: "2010",
            counterBankName: "Fio banka, a.s.",
            constantSymbol: "0308",
            variableSymbol: "123456",
            specificSymbol: "789",
            userIdentification: "Terminal 1",
            recipientMessage: "Thanks",
            type: "Bezhotovostní příjem",
            instructionId: "ABC123",
          },
        ],
      },
    })
    expect(requestedUrls).toEqual([
      "https://example.test/v1/rest/last/token-a/transactions.json",
    ])
  })

  test("supports a single transaction object in FIO response", async () => {
    const deps = {
      ...createFioApiDep({
        tokens: ["token-a"],
        baseUrl: "https://example.test",
      }),
      fetch: async () => statementResponse(transaction),
    } satisfies FioApiDep & FetchDep
    await using run = testCreateRun(deps)

    const result = await run(fetchFioLastTransactions())

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.transactions).toHaveLength(1)
    expect(result.value.transactions[0]?.id).toBe("123456789")
  })

  test("rotates tokens across requests", async () => {
    const requestedUrls: string[] = []
    const deps = {
      ...createFioApiDep({
        tokens: ["token-a", "token-b"],
        baseUrl: "https://example.test",
      }),
      fetch: async (input) => {
        requestedUrls.push(inputToString(input))
        return statementResponse([])
      },
    } satisfies FioApiDep & FetchDep
    await using run = testCreateRun(deps)

    await run(fetchFioLastTransactions())
    await run(fetchFioLastTransactions())
    await run(fetchFioLastTransactions())

    expect(requestedUrls).toEqual([
      "https://example.test/v1/rest/last/token-a/transactions.json",
      "https://example.test/v1/rest/last/token-b/transactions.json",
      "https://example.test/v1/rest/last/token-a/transactions.json",
    ])
  })

  test("downloads transactions by period", async () => {
    const requestedUrls: string[] = []
    const deps = {
      ...createFioApiDep({
        tokens: ["token-a"],
        baseUrl: "https://example.test",
      }),
      fetch: async (input) => {
        requestedUrls.push(inputToString(input))
        return statementResponse([])
      },
    } satisfies FioApiDep & FetchDep
    await using run = testCreateRun(deps)

    await run(
      fetchFioTransactionsByPeriod({
        from: dateString("2026-05-01"),
        to: dateString("2026-05-27"),
      })
    )

    expect(requestedUrls).toEqual([
      "https://example.test/v1/rest/periods/token-a/2026-05-01/2026-05-27/transactions.json",
    ])
  })

  test("sets the last successful download date", async () => {
    const requestedUrls: string[] = []
    const deps = {
      ...createFioApiDep({
        tokens: ["token-a"],
        baseUrl: "https://example.test",
      }),
      fetch: async (input) => {
        requestedUrls.push(inputToString(input))
        return new Response(null, { status: 204 })
      },
    } satisfies FioApiDep & FetchDep
    await using run = testCreateRun(deps)

    await expect(
      run(setFioLastDate({ date: dateString("2026-05-27") }))
    ).resolves.toMatchObject({
      ok: true,
      value: "",
    })
    expect(requestedUrls).toEqual([
      "https://example.test/v1/rest/set-last-date/token-a/2026-05-27/",
    ])
  })

  test("returns a typed rate limit error", async () => {
    const deps = {
      ...createFioApiDep({
        tokens: ["token-a"],
        baseUrl: "https://example.test",
      }),
      fetch: async () => new Response("Too many requests", { status: 409 }),
    } satisfies FioApiDep & FetchDep
    await using run = testCreateRun(deps)

    await expect(run(fetchFioLastTransactions())).resolves.toMatchObject({
      ok: false,
      error: {
        type: "FioRateLimitError",
        message:
          "FIO API request failed because the interval between requests was not respected.",
        status: 409,
        responseBody: "Too many requests",
      } satisfies Partial<FioRateLimitError>,
    })
  })

  test("returns a typed strong authorization error", async () => {
    const responseBody =
      "Data není možné poskytnout bez silné autorizace. Pokyn k zobrazení dat si autorizujte ve Vašem Internetovém bankovnictví a data si vyžádejte znovu. Platnost ověření je 10 minut od autorizace. Nebo požádejte o data, která nejsou starší jak 90 dní (od 28.02.2026), v takovém případě není autorizace třeba."
    const deps = {
      ...createFioApiDep({
        tokens: ["token-a"],
        baseUrl: "https://example.test",
      }),
      fetch: async () => new Response(responseBody, { status: 422 }),
    } satisfies FioApiDep & FetchDep
    await using run = testCreateRun(deps)

    await expect(run(fetchFioLastTransactions())).resolves.toMatchObject({
      ok: false,
      error: {
        type: "FioStrongAuthorizationRequiredError",
        message:
          "FIO API requires strong authorization to provide the requested data.",
        status: 422,
        responseBody,
      } satisfies Partial<FioStrongAuthorizationRequiredError>,
    })
  })
})
