import type { Task } from "@evolu/common"
import { apiUrl } from "@/core/app-env.ts"
import {
  type FetchDep,
  type FetchError,
  fetchAndValidateJson,
} from "@/core/deps.ts"
import { defineError } from "@/core/error.ts"
import {
  type DonationHistoryPage,
  DonationHistoryResponseSchema,
} from "@/core/integrations/donations/donation-history.ts"

const buildDonationsUrl = (cursor: string | undefined): string =>
  cursor === undefined
    ? apiUrl("/api/donations")
    : `${apiUrl("/api/donations")}?cursor=${encodeURIComponent(cursor)}`

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
