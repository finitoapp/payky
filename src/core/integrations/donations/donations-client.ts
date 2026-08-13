import type { Task } from "@evolu/common"
import { z } from "zod"
import {
  type FetchDep,
  type FetchError,
  fetchAndValidateJson,
} from "@/core/deps.ts"
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
  (run) =>
    run(
      fetchAndValidateJson({
        url: buildDonationsUrl(cursor),
        schema: DonationHistoryResponseSchema,
        onHttpError: ({ status, responseBody }) =>
          createDonationsHttpError({
            message: `Donation history request failed: ${status}`,
            status,
            responseBody,
          }),
        onResponseError: ({ status, responseBody, cause }) =>
          createDonationsResponseError({
            message: "Invalid donation history response.",
            status,
            responseBody,
            cause,
          }),
      })
    )
