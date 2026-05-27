import { z } from "zod"

import type { FiatCurrency } from "@/core/modules/shared/schema.ts"

type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response>

export interface ExchangeRateQuote {
  readonly exchangeRate: number
  readonly fetchedAt: number
}

export interface ExchangeRateDep {
  readonly fetchYadioBtcExchangeRate: (
    currency: FiatCurrency
  ) => Promise<ExchangeRateQuote>
}

interface YadioExchangeRateClientOptions {
  readonly baseUrl?: string
  readonly fetch?: FetchLike
}

const YADIO_BASE_URL = "https://api.yadio.io"

const YadioExchangeRateResponseSchema = z.object({
  BTC: z.number().positive(),
  timestamp: z.number().int().nonnegative(),
})

export class YadioHttpError extends Error {
  public readonly status: number
  public readonly responseBody: string

  public constructor(message: string, status: number, responseBody: string) {
    super(message)
    this.name = "YadioHttpError"
    this.status = status
    this.responseBody = responseBody
  }
}

export const fetchYadioBtcExchangeRate = async (
  currency: FiatCurrency,
  {
    baseUrl = YADIO_BASE_URL,
    fetch: fetchFn = fetch,
  }: YadioExchangeRateClientOptions = {}
): Promise<ExchangeRateQuote> => {
  const response = await fetchFn(new URL(`/exrates/${currency}`, baseUrl))
  if (!response.ok) {
    throw new YadioHttpError(
      `Yadio exchange rate request failed: ${response.status}`,
      response.status,
      await response.text()
    )
  }

  const parsed = YadioExchangeRateResponseSchema.parse(await response.json())

  return {
    exchangeRate: parsed.BTC,
    fetchedAt: parsed.timestamp,
  }
}
