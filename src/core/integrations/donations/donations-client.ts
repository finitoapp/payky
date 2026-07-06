import { err, ok, type Task } from "@evolu/common"
import { z } from "zod"
import { appFetchAsJson, type FetchDep, type FetchError } from "@/core/deps.ts"
import { defineError } from "@/core/error.ts"

const DONATIONS_URL = "/api/donations"

const buildDonationsUrl = (cursor: string | undefined): string =>
  cursor === undefined
    ? DONATIONS_URL
    : `${DONATIONS_URL}?cursor=${encodeURIComponent(cursor)}`

export interface DonationHistoryItem {
  readonly amountSats: number
  readonly occurredAt: number
}

export interface DonationHistoryPage {
  readonly items: readonly DonationHistoryItem[]
  readonly nextCursor: string | null
}

const DonationHistoryResponseSchema = z.object({
  items: z.array(
    z.object({
      amountSats: z.number().int().positive(),
      occurredAt: z.number().int().nonnegative(),
    })
  ),
  nextCursor: z.string().trim().min(1).nullable(),
})

const createDonationsHttpError = defineError("DonationsHttpError")<{
  readonly message: string
  readonly status: number
  readonly responseBody: string
}>()
export type DonationsHttpError = ReturnType<typeof createDonationsHttpError>

const createDonationsResponseError = defineError("DonationsResponseError")<{
  readonly message: string
  readonly status: number
  readonly responseBody: string
  readonly cause?: unknown
}>()
export type DonationsResponseError = ReturnType<
  typeof createDonationsResponseError
>

export type DonationsError =
  | DonationsHttpError
  | DonationsResponseError
  | FetchError

export const fetchDonationHistory =
  ({
    cursor,
  }: {
    readonly cursor?: string
  }): Task<DonationHistoryPage, DonationsError, FetchDep> =>
  async (run) => {
    const response = await run(appFetchAsJson(buildDonationsUrl(cursor)))
    if (!response.ok) return response

    if (!response.value.ok) {
      return err(
        createDonationsHttpError({
          message: `Donation history request failed: ${response.value.status}`,
          status: response.value.status,
          responseBody: response.value.text,
        })
      )
    }

    if (!response.value.json.ok) {
      return err(
        createDonationsResponseError({
          message: "Invalid donation history response.",
          status: response.value.status,
          responseBody: response.value.text,
          cause: response.value.json.error,
        })
      )
    }

    const parsed = DonationHistoryResponseSchema.safeParse(
      response.value.json.value
    )
    if (!parsed.success) {
      return err(
        createDonationsResponseError({
          message: "Invalid donation history response.",
          status: response.value.status,
          responseBody: response.value.text,
          cause: parsed.error,
        })
      )
    }

    return ok(parsed.data)
  }
