import type { Task } from "@evolu/common"
import {
  type FetchDep,
  type FetchError,
  fetchAndValidateJson,
} from "../../deps.ts"
import { defineError } from "../../error.ts"
import {
  type DonationHistoryPage,
  DonationHistoryResponseSchema,
} from "./donation-history.ts"

const buildDonationsUrl = (
  endpoint: string,
  cursor: string | undefined
): string =>
  cursor === undefined
    ? endpoint
    : `${endpoint}?cursor=${encodeURIComponent(cursor)}`

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
    endpoint,
    cursor,
  }: {
    /** This app's own `/api/donations`, absolute on native. */
    readonly endpoint: string
    readonly cursor?: string
  }): Task<DonationHistoryPage, DonationsError, FetchDep> =>
  (run) =>
    run(
      fetchAndValidateJson({
        url: buildDonationsUrl(endpoint, cursor),
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
