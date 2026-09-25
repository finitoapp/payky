import { err, type Task } from "@evolu/common"
import { z } from "zod"
import {
  appFetchAsJson,
  type FetchDep,
  type FetchError,
  validateJsonResponse,
} from "@/core/deps.ts"
import { defineError } from "@/core/error.ts"

export const MSATS_PER_SAT = 1_000

const LnurlErrorSchema = z.object({
  status: z.literal("ERROR"),
  reason: z.string().trim().min(1),
})

export const createLnurlRequestError = defineError("LnurlRequestError")<{
  readonly message: string
}>()
export type LnurlRequestError = ReturnType<typeof createLnurlRequestError>

const createLnurlHttpError = defineError("LnurlHttpError")<{
  readonly message: string
  readonly status: number
  readonly responseBody: string
}>()
export type LnurlHttpError = ReturnType<typeof createLnurlHttpError>

const createLnurlResponseError = defineError("LnurlResponseError")<{
  readonly message: string
  readonly status: number
  readonly responseBody: string
  readonly cause?: unknown
}>()
export type LnurlResponseError = ReturnType<typeof createLnurlResponseError>

export type LnurlError =
  | LnurlRequestError
  | LnurlHttpError
  | LnurlResponseError
  | FetchError

/**
 * Fetches an LNURL endpoint and validates its JSON body against `schema`.
 *
 * An LNURL `{ status: "ERROR", reason }` body takes precedence over the HTTP
 * status (per LUD-06 it may arrive with any status code), then HTTP failures,
 * then schema validation.
 */
export const fetchLnurlJson =
  <TSchema extends z.ZodType>(
    url: string | URL,
    describe: string,
    schema: TSchema
  ): Task<z.output<TSchema>, LnurlError, FetchDep> =>
  async (run) => {
    const responseResult = await run(appFetchAsJson(url))
    if (!responseResult.ok) return responseResult

    const response = responseResult.value
    if (response.json.ok) {
      const lnurlError = LnurlErrorSchema.safeParse(response.json.value)
      if (lnurlError.success) {
        return err(createLnurlRequestError({ message: lnurlError.data.reason }))
      }
    }

    return validateJsonResponse(response, {
      schema,
      onHttpError: ({ status, responseBody }) =>
        createLnurlHttpError({
          message: `${describe} request failed: ${status}`,
          status,
          responseBody,
        }),
      onResponseError: ({ status, responseBody, cause }) =>
        createLnurlResponseError({
          message: `Invalid ${describe} response.`,
          status,
          responseBody,
          cause,
        }),
    })
  }
