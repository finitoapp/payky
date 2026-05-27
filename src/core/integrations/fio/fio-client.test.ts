import { describe, expect, test } from "vitest"

import { DateStringSchema } from "@/core/modules/shared/schema.ts"
import { FioApiClient, type FioHttpError } from "./fio-client.ts"

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

describe("FioApiClient", () => {
  test("downloads and normalizes last transactions", async () => {
    const requestedUrls: string[] = []
    const client = new FioApiClient({
      tokens: ["token-a"],
      baseUrl: "https://example.test",
      fetch: async (input) => {
        requestedUrls.push(inputToString(input))
        return statementResponse([transaction])
      },
    })

    await expect(client.getLastTransactions()).resolves.toMatchObject({
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
    })
    expect(requestedUrls).toEqual([
      "https://example.test/v1/rest/last/token-a/transactions.json",
    ])
  })

  test("supports a single transaction object in FIO response", async () => {
    const client = new FioApiClient({
      tokens: ["token-a"],
      baseUrl: "https://example.test",
      fetch: async () => statementResponse(transaction),
    })

    const statement = await client.getLastTransactions()

    expect(statement.transactions).toHaveLength(1)
    expect(statement.transactions[0]?.id).toBe("123456789")
  })

  test("rotates tokens across requests", async () => {
    const requestedUrls: string[] = []
    const client = new FioApiClient({
      tokens: ["token-a", "token-b"],
      baseUrl: "https://example.test",
      fetch: async (input) => {
        requestedUrls.push(inputToString(input))
        return statementResponse([])
      },
    })

    await client.getLastTransactions()
    await client.getLastTransactions()
    await client.getLastTransactions()

    expect(requestedUrls).toEqual([
      "https://example.test/v1/rest/last/token-a/transactions.json",
      "https://example.test/v1/rest/last/token-b/transactions.json",
      "https://example.test/v1/rest/last/token-a/transactions.json",
    ])
  })

  test("downloads transactions by period", async () => {
    const requestedUrls: string[] = []
    const client = new FioApiClient({
      tokens: ["token-a"],
      baseUrl: "https://example.test",
      fetch: async (input) => {
        requestedUrls.push(inputToString(input))
        return statementResponse([])
      },
    })

    await client.getTransactionsByPeriod({
      from: dateString("2026-05-01"),
      to: dateString("2026-05-27"),
    })

    expect(requestedUrls).toEqual([
      "https://example.test/v1/rest/periods/token-a/2026-05-01/2026-05-27/transactions.json",
    ])
  })

  test("sets the last successful download date", async () => {
    const requestedUrls: string[] = []
    const client = new FioApiClient({
      tokens: ["token-a"],
      baseUrl: "https://example.test",
      fetch: async (input) => {
        requestedUrls.push(inputToString(input))
        return new Response("OK", { status: 200 })
      },
    })

    await expect(
      client.setLastDate({ date: dateString("2026-05-27") })
    ).resolves.toBe("OK")
    expect(requestedUrls).toEqual([
      "https://example.test/v1/rest/set-last-date/token-a/2026-05-27/",
    ])
  })

  test("throws typed HTTP errors", async () => {
    const client = new FioApiClient({
      tokens: ["token-a"],
      baseUrl: "https://example.test",
      fetch: async () => new Response("Too many requests", { status: 409 }),
    })

    await expect(client.getLastTransactions()).rejects.toMatchObject({
      name: "FioHttpError",
      status: 409,
      responseBody: "Too many requests",
    } satisfies Partial<FioHttpError>)
  })
})
