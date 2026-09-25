import { testCreateRun } from "@evolu/common"
import { describe, expect, test } from "vitest"

import type { FetchDep } from "@/core/deps.ts"
import {
  lnurlWithdrawUrl,
  redeemLnurlWithdraw,
} from "./lnurl-withdraw-client.ts"

const inputToString = (input: RequestInfo | URL): string =>
  input instanceof URL ? input.toString() : String(input)

const withdrawRequest = {
  tag: "withdrawRequest",
  callback: "https://card.example.test/callback?card=1",
  k1: "k1-value",
  minWithdrawable: 1_000,
  maxWithdrawable: 50_000_000,
  defaultDescription: "Bolt Card",
}

const createDeps = (callbackBody: unknown = { status: "OK" }) => {
  const requestedUrls: string[] = []
  const deps = {
    fetch: async (input) => {
      const url = inputToString(input)
      requestedUrls.push(url)
      return Response.json(
        url.startsWith("https://card.example.test/callback")
          ? callbackBody
          : withdrawRequest
      )
    },
  } satisfies FetchDep
  return { deps, requestedUrls }
}

const redeem = (amountSats = 21_000) =>
  redeemLnurlWithdraw({
    uri: "lnurlw://card.example.test/ln?p=AA&c=BB",
    invoice: "lnbc1invoice",
    amountSats,
  })

describe("lnurl withdraw client", () => {
  test("maps a LUD-17 lnurlw link to https", () => {
    const url = lnurlWithdrawUrl("LNURLW://card.example.test/ln?p=AA&c=BB")

    expect(url.ok && url.value.toString()).toBe(
      "https://card.example.test/ln?p=AA&c=BB"
    )
  })

  test("rejects a link that is not LNURL-withdraw", () => {
    expect(lnurlWithdrawUrl("mailto:someone@example.test")).toMatchObject({
      ok: false,
      error: { type: "LnurlWithdrawUnsupportedUri" },
    })
  })

  test("hands the invoice to the withdraw callback", async () => {
    const { deps, requestedUrls } = createDeps()
    await using run = testCreateRun(deps)

    await expect(run(redeem())).resolves.toEqual({ ok: true, value: undefined })
    expect(requestedUrls).toEqual([
      "https://card.example.test/ln?p=AA&c=BB",
      "https://card.example.test/callback?card=1&k1=k1-value&pr=lnbc1invoice",
    ])
  })

  test("refuses an amount above the card's limit without calling back", async () => {
    const { deps, requestedUrls } = createDeps()
    await using run = testCreateRun(deps)

    await expect(run(redeem(50_001))).resolves.toMatchObject({
      ok: false,
      error: { type: "LnurlWithdrawAmountOutOfRange", amountSats: 50_001 },
    })
    expect(requestedUrls).toHaveLength(1)
  })

  test("surfaces the service's rejection reason", async () => {
    const { deps } = createDeps({ status: "ERROR", reason: "Card disabled" })
    await using run = testCreateRun(deps)

    await expect(run(redeem())).resolves.toMatchObject({
      ok: false,
      error: { type: "LnurlRequestError", message: "Card disabled" },
    })
  })
})
