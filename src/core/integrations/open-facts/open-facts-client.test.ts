import { testCreateRun } from "@evolu/common"
import { describe, expect, test } from "vitest"

import type { FetchDep } from "@/core/deps.ts"
import { isRetailBarcode, lookupOpenFactsProduct } from "./open-facts-client.ts"

const inputToString = (input: RequestInfo | URL): string =>
  input instanceof URL ? input.toString() : String(input)

const notFound = () =>
  Response.json(
    { status: 0, status_verbose: "product not found" },
    { status: 404 }
  )

describe("isRetailBarcode", () => {
  test.each([
    "5449000000996", // EAN-13
    "96385074", // EAN-8
    "036000291452", // UPC-A
  ])("accepts %s", (code) => {
    expect(isRetailBarcode(code)).toBe(true)
  })

  test.each([
    "5449000000997", // wrong check digit
    "12345",
    "ABC-123",
    "https://example.test/5449000000996",
  ])("rejects %s", (code) => {
    expect(isRetailBarcode(code)).toBe(false)
  })
})

describe("lookupOpenFactsProduct", () => {
  test("prefers the localized name and joins brand and quantity", async () => {
    const requestedUrls: string[] = []
    const deps = {
      fetch: async (input) => {
        requestedUrls.push(inputToString(input))
        return Response.json({
          status: 1,
          product: {
            product_name: "Coca-Cola Original",
            product_name_cs: "Coca-Cola",
            brands: "Coca-Cola, The Coca-Cola Company",
            quantity: "330 ml",
          },
        })
      },
    } satisfies FetchDep
    await using run = testCreateRun(deps)

    await expect(
      run(lookupOpenFactsProduct({ code: "5449000000996", language: "cs" }))
    ).resolves.toEqual({
      ok: true,
      value: {
        name: "Coca-Cola",
        description: "Coca-Cola, 330 ml",
        source: "Open Food Facts",
      },
    })
    expect(requestedUrls).toEqual([
      "https://world.openfoodfacts.org/api/v2/product/5449000000996.json?fields=product_name%2Cproduct_name_cs%2Cbrands%2Cquantity",
    ])
  })

  test("falls back to Open Beauty Facts and the generic name", async () => {
    const deps = {
      fetch: async (input) =>
        inputToString(input).includes("openfoodfacts")
          ? notFound()
          : Response.json({
              status: 1,
              product: { product_name: "Nivea Creme", product_name_sk: " " },
            }),
    } satisfies FetchDep
    await using run = testCreateRun(deps)

    await expect(
      run(lookupOpenFactsProduct({ code: "4005808001010", language: "sk" }))
    ).resolves.toEqual({
      ok: true,
      value: {
        name: "Nivea Creme",
        description: null,
        source: "Open Beauty Facts",
      },
    })
  })

  test("returns null when neither database knows the code", async () => {
    const deps = { fetch: async () => notFound() } satisfies FetchDep
    await using run = testCreateRun(deps)

    await expect(
      run(lookupOpenFactsProduct({ code: "5449000000996", language: "en" }))
    ).resolves.toEqual({ ok: true, value: null })
  })

  test("reports a server failure as an HTTP error", async () => {
    const deps = {
      fetch: async () => new Response("down", { status: 503 }),
    } satisfies FetchDep
    await using run = testCreateRun(deps)

    const result = await run(
      lookupOpenFactsProduct({ code: "5449000000996", language: "en" })
    )

    expect(result).toMatchObject({
      ok: false,
      error: { type: "OpenFactsHttpError", status: 503, responseBody: "down" },
    })
  })
})
