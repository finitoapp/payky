import { err, ok, type Task } from "@evolu/common"
import { z } from "zod"
import type { FetchDep } from "@/core/deps.ts"
import { defineError } from "@/core/error.ts"
import type { FiatCurrency } from "@/core/modules/shared/schema.ts"

export interface ExchangeRateQuote {
  readonly exchangeRate: number
  readonly fetchedAt: number
}

const YADIO_BASE_URL = "https://api.yadio.io"

const YadioExchangeRateResponseSchema = z.object({
  BTC: z.number().positive(),
  timestamp: z.number().int().nonnegative(),
})

const createYadioHttpError = defineError("YadioHttpError")<{
  readonly message: string
  readonly status: number
  readonly responseBody: string
}>()
export type YadioHttpError = ReturnType<typeof createYadioHttpError>

export const fetchYadioBtcExchangeRate =
  (currency: FiatCurrency): Task<ExchangeRateQuote, YadioHttpError, FetchDep> =>
  async (run) => {
    const response = await run.deps.fetch(
      new URL(`/exrates/${currency}`, YADIO_BASE_URL),
      {
        signal: run.signal,
      }
    )
    if (!response.ok) {
      return err(
        createYadioHttpError({
          message: `Yadio exchange rate request failed: ${response.status}`,
          status: response.status,
          responseBody: await response.text(),
        })
      )
    }

    const parsed = YadioExchangeRateResponseSchema.parse(await response.json())

    return ok({
      exchangeRate: parsed.BTC,
      fetchedAt: parsed.timestamp,
    })
  }
