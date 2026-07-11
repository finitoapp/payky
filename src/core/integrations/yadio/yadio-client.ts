import { err, ok, type Task } from "@evolu/common"
import { z } from "zod"
import { appFetchAsJson, type FetchDep, type FetchError } from "@/core/deps.ts"
import { defineError } from "@/core/error.ts"
import type { FiatCurrency } from "@/core/modules/shared/schema.ts"

export interface ExchangeRateQuote {
  readonly exchangeRate: number
  readonly fetchedAt: number
}

const YADIO_BASE_URL = "https://api.yadio.io"

export interface YadioApiOptions {
  readonly baseUrl?: string
}

export interface YadioApiDep {
  readonly yadioApi: {
    readonly baseUrl: string
  }
}

export const createYadioApiDep = ({
  baseUrl = YADIO_BASE_URL,
}: YadioApiOptions = {}): YadioApiDep => ({
  yadioApi: {
    baseUrl,
  },
})

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

const createYadioApiError = defineError("YadioApiError")<{
  readonly message: string
  readonly status: number
  readonly responseBody: string
  readonly cause?: unknown
}>()
export type YadioApiError = ReturnType<typeof createYadioApiError>

export const fetchYadioBtcExchangeRate =
  (
    currency: FiatCurrency
  ): Task<
    ExchangeRateQuote,
    YadioHttpError | YadioApiError | FetchError,
    YadioApiDep & FetchDep
  > =>
  async (run) => {
    const responseResult = await run(
      appFetchAsJson(new URL(`/exrates/${currency}`, run.deps.yadioApi.baseUrl))
    )
    if (!responseResult.ok) return responseResult

    const response = responseResult.value
    if (!response.ok) {
      return err(
        createYadioHttpError({
          message: `Yadio exchange rate request failed: ${response.status}`,
          status: response.status,
          responseBody: response.text,
        })
      )
    }

    if (!response.json.ok) {
      return err(
        createYadioApiError({
          message: "Invalid Yadio exchange rate response.",
          status: response.status,
          responseBody: response.text,
          cause: response.json.error,
        })
      )
    }

    const parsed = YadioExchangeRateResponseSchema.safeParse(
      response.json.value
    )
    if (!parsed.success) {
      return err(
        createYadioApiError({
          message: "Invalid Yadio exchange rate response.",
          status: response.status,
          responseBody: response.text,
          cause: parsed.error,
        })
      )
    }

    return ok({
      exchangeRate: parsed.data.BTC,
      fetchedAt: parsed.data.timestamp,
    })
  }
