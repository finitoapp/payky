import { testCreateRun } from "@evolu/common"
import { describe, expect, test } from "vitest"

import type { FetchDep } from "@/core/deps.ts"
import {
  createLud16MetadataUrl,
  fetchLnurlPayInvoice,
  fetchLnurlPayMetadata,
  fetchLnurlVerify,
  type LnurlPayHttpError,
  type LnurlPayMetadata,
  type LnurlPayResponseError,
} from "./lnurl-pay-client.ts"

const inputToString = (input: RequestInfo | URL): string =>
  input instanceof URL ? input.toString() : String(input)

const metadataResponse = () =>
  Response.json({
    tag: "payRequest",
    callback: "https://pay.example.test/callback",
    minSendable: 1_000,
    maxSendable: 100_000_000,
    metadata: '[["text/plain","Donate"]]',
  })

const metadata: LnurlPayMetadata = {
  callback: "https://pay.example.test/callback",
  minSendableSats: 1,
  maxSendableSats: 100_000,
}

describe("lnurl pay client", () => {
  test("creates a LUD-16 metadata URL", () => {
    const url = createLud16MetadataUrl("donate@payky.me")

    expect(url).toMatchObject({ ok: true })
    if (!url.ok) return
    expect(url.value.toString()).toBe(
      "https://payky.me/.well-known/lnurlp/donate"
    )
  })

  test("rejects an invalid Lightning address", () => {
    expect(createLud16MetadataUrl("not-an-address")).toMatchObject({
      ok: false,
      error: {
        type: "LnurlPayRequestError",
        message: "Invalid Lightning address.",
      },
    })
  })

  test("downloads and normalizes pay metadata", async () => {
    const requestedUrls: string[] = []
    const deps = {
      fetch: async (input) => {
        requestedUrls.push(inputToString(input))
        return metadataResponse()
      },
    } satisfies FetchDep
    await using run = testCreateRun(deps)

    await expect(
      run(fetchLnurlPayMetadata({ address: "donate@payky.me" }))
    ).resolves.toEqual({
      ok: true,
      value: {
        callback: "https://pay.example.test/callback",
        minSendableSats: 1,
        maxSendableSats: 100_000,
      },
    })
    expect(requestedUrls).toEqual([
      "https://payky.me/.well-known/lnurlp/donate",
    ])
  })

  test("returns the LNURL error reason from an ERROR body", async () => {
    const deps = {
      fetch: async () =>
        Response.json(
          { status: "ERROR", reason: "Recipient not found." },
          { status: 404 }
        ),
    } satisfies FetchDep
    await using run = testCreateRun(deps)

    await expect(
      run(fetchLnurlPayMetadata({ address: "donate@payky.me" }))
    ).resolves.toMatchObject({
      ok: false,
      error: {
        type: "LnurlPayRequestError",
        message: "Recipient not found.",
      },
    })
  })

  test("returns typed HTTP errors with status and response body", async () => {
    const deps = {
      fetch: async () => new Response("Service unavailable", { status: 503 }),
    } satisfies FetchDep
    await using run = testCreateRun(deps)

    await expect(
      run(fetchLnurlPayMetadata({ address: "donate@payky.me" }))
    ).resolves.toMatchObject({
      ok: false,
      error: {
        type: "LnurlPayHttpError",
        message: "LNURL metadata request failed: 503",
        status: 503,
        responseBody: "Service unavailable",
      } satisfies Partial<LnurlPayHttpError>,
    })
  })

  test("returns a typed error for a non-JSON response body", async () => {
    const deps = {
      fetch: async () => new Response("<html>not json</html>", { status: 200 }),
    } satisfies FetchDep
    await using run = testCreateRun(deps)

    await expect(
      run(fetchLnurlPayMetadata({ address: "donate@payky.me" }))
    ).resolves.toMatchObject({
      ok: false,
      error: {
        type: "LnurlPayResponseError",
        message: "Invalid LNURL metadata response.",
        status: 200,
        responseBody: "<html>not json</html>",
      } satisfies Partial<LnurlPayResponseError>,
    })
  })

  test("returns a typed error for a malformed metadata response", async () => {
    const deps = {
      fetch: async () => Response.json({ tag: "payRequest" }),
    } satisfies FetchDep
    await using run = testCreateRun(deps)

    await expect(
      run(fetchLnurlPayMetadata({ address: "donate@payky.me" }))
    ).resolves.toMatchObject({
      ok: false,
      error: {
        type: "LnurlPayResponseError",
        message: "Invalid LNURL metadata response.",
        status: 200,
      } satisfies Partial<LnurlPayResponseError>,
    })
  })

  test("returns a typed error for a network failure", async () => {
    const deps = {
      fetch: async () => {
        throw new TypeError("Failed to fetch")
      },
    } satisfies FetchDep
    await using run = testCreateRun(deps)

    await expect(
      run(fetchLnurlPayMetadata({ address: "donate@payky.me" }))
    ).resolves.toMatchObject({
      ok: false,
      error: {
        type: "FetchError",
      },
    })
  })

  test("requests an invoice for the amount in millisats", async () => {
    const requestedUrls: string[] = []
    const deps = {
      fetch: async (input) => {
        requestedUrls.push(inputToString(input))
        return Response.json({
          pr: "lnbc21invoice",
          routes: [],
          verify: "https://pay.example.test/verify/1",
        })
      },
    } satisfies FetchDep
    await using run = testCreateRun(deps)

    await expect(
      run(fetchLnurlPayInvoice({ amountSats: 21, metadata }))
    ).resolves.toEqual({
      ok: true,
      value: {
        pr: "lnbc21invoice",
        verify: "https://pay.example.test/verify/1",
      },
    })
    expect(requestedUrls).toEqual([
      "https://pay.example.test/callback?amount=21000",
    ])
  })

  test("returns a typed error for a malformed invoice response", async () => {
    const deps = {
      fetch: async () => Response.json({ pr: "" }),
    } satisfies FetchDep
    await using run = testCreateRun(deps)

    await expect(
      run(fetchLnurlPayInvoice({ amountSats: 21, metadata }))
    ).resolves.toMatchObject({
      ok: false,
      error: {
        type: "LnurlPayResponseError",
        message: "Invalid LNURL invoice response.",
        status: 200,
      } satisfies Partial<LnurlPayResponseError>,
    })
  })

  test("downloads and normalizes verify state", async () => {
    const deps = {
      fetch: async () =>
        Response.json({
          status: "OK",
          settled: true,
          preimage: "abc",
          pr: "lnbc21invoice",
        }),
    } satisfies FetchDep
    await using run = testCreateRun(deps)

    await expect(
      run(fetchLnurlVerify({ verifyUrl: "https://pay.example.test/verify/1" }))
    ).resolves.toEqual({
      ok: true,
      value: {
        settled: true,
        preimage: "abc",
        pr: "lnbc21invoice",
      },
    })
  })

  test("returns a typed error for a malformed verify response", async () => {
    const deps = {
      fetch: async () => new Response("not json", { status: 200 }),
    } satisfies FetchDep
    await using run = testCreateRun(deps)

    await expect(
      run(fetchLnurlVerify({ verifyUrl: "https://pay.example.test/verify/1" }))
    ).resolves.toMatchObject({
      ok: false,
      error: {
        type: "LnurlPayResponseError",
        message: "Invalid LNURL verify response.",
        status: 200,
        responseBody: "not json",
      } satisfies Partial<LnurlPayResponseError>,
    })
  })
})
