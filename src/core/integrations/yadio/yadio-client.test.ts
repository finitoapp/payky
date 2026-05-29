import { testCreateRun } from "@evolu/common"
import { describe, expect, test } from "vitest"

import type { FetchDep } from "@/core/deps.ts"
import type { FiatCurrency } from "@/core/modules/shared/schema.ts"
import {
  fetchYadioBtcExchangeRate,
  type YadioHttpError,
} from "./yadio-client.ts"

const inputToString = (input: RequestInfo | URL): string =>
  input instanceof URL ? input.toString() : String(input)

const exchangeRateResponse = ({
  btc,
  timestamp,
}: {
  readonly btc: number
  readonly timestamp: number
}) =>
  Response.json({
    BTC: btc,
    timestamp,
  })

describe("yadio client", () => {
  test("downloads and normalizes BTC exchange rate", async () => {
    const requestedUrls: string[] = []
    const deps = {
      fetch: async (input) => {
        requestedUrls.push(inputToString(input))
        return exchangeRateResponse({
          btc: 1_986_543.21,
          timestamp: 1_777_777_777,
        })
      },
    } satisfies FetchDep
    await using run = testCreateRun(deps)

    await expect(
      run(fetchYadioBtcExchangeRate("CZK" satisfies FiatCurrency))
    ).resolves.toEqual({
      ok: true,
      value: {
        exchangeRate: 1_986_543.21,
        fetchedAt: 1_777_777_777,
      },
    })
    expect(requestedUrls).toEqual(["https://api.yadio.io/exrates/CZK"])
  })

  test("passes the task abort signal to fetch", async () => {
    const receivedSignals: readonly (AbortSignal | null | undefined)[] = []
    const deps = {
      fetch: async (_input, init) => {
        receivedSignals.push(init?.signal)
        return exchangeRateResponse({
          btc: 1_000_000,
          timestamp: 1_777_777_777,
        })
      },
    } satisfies FetchDep
    await using run = testCreateRun(deps)

    await run(fetchYadioBtcExchangeRate("CZK" satisfies FiatCurrency))

    expect(receivedSignals).toHaveLength(1)
    expect(receivedSignals[0]).toBeInstanceOf(AbortSignal)
  })

  test("returns typed HTTP errors", async () => {
    const deps = {
      fetch: async () =>
        new Response("Service unavailable", {
          status: 503,
        }),
    } satisfies FetchDep
    await using run = testCreateRun(deps)

    await expect(
      run(fetchYadioBtcExchangeRate("CZK" satisfies FiatCurrency))
    ).resolves.toMatchObject({
      ok: false,
      error: {
        type: "YadioHttpError",
        message: "Yadio exchange rate request failed: 503",
        status: 503,
        responseBody: "Service unavailable",
      } satisfies Partial<YadioHttpError>,
    })
  })
})
