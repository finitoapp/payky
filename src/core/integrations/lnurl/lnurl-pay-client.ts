import { err, ok, type Result, type Task } from "@evolu/common"
import { z } from "zod"
import { appFetchAsJson, type FetchDep, type FetchError } from "@/core/deps.ts"
import { defineError } from "@/core/error.ts"

const MSATS_PER_SAT = 1_000

const LnurlPayMetadataSchema = z.object({
  tag: z.literal("payRequest"),
  callback: z.url(),
  minSendable: z.number().int().positive(),
  maxSendable: z.number().int().positive(),
  metadata: z.string(),
})

const LnurlPayInvoiceSchema = z.object({
  pr: z.string().trim().min(1),
  routes: z.array(z.unknown()).readonly(),
  verify: z.url().optional(),
})

const LnurlVerifySchema = z.object({
  status: z.literal("OK"),
  settled: z.boolean(),
  preimage: z.string().trim().min(1).nullable(),
  pr: z.string().trim().min(1),
})

const LnurlErrorSchema = z.object({
  status: z.literal("ERROR"),
  reason: z.string().trim().min(1),
})

export interface LnurlPayMetadata {
  readonly callback: string
  readonly minSendableSats: number
  readonly maxSendableSats: number
}

export interface LnurlPayInvoice {
  readonly pr: string
  readonly verify?: string
}

export interface LnurlVerify {
  readonly settled: boolean
  readonly preimage: string | null
  readonly pr: string
}

const createLnurlPayRequestError = defineError("LnurlPayRequestError")<{
  readonly message: string
}>()
export type LnurlPayRequestError = ReturnType<typeof createLnurlPayRequestError>

const createLnurlPayHttpError = defineError("LnurlPayHttpError")<{
  readonly message: string
  readonly status: number
  readonly responseBody: string
}>()
export type LnurlPayHttpError = ReturnType<typeof createLnurlPayHttpError>

const createLnurlPayResponseError = defineError("LnurlPayResponseError")<{
  readonly message: string
  readonly status: number
  readonly responseBody: string
  readonly cause?: unknown
}>()
export type LnurlPayResponseError = ReturnType<
  typeof createLnurlPayResponseError
>

export type LnurlPayError =
  | LnurlPayRequestError
  | LnurlPayHttpError
  | LnurlPayResponseError
  | FetchError

type LnurlPayTask<TResult> = Task<TResult, LnurlPayError, FetchDep>

export const createLud16MetadataUrl = (
  address: string
): Result<URL, LnurlPayRequestError> => {
  const [name, domain, extra] = address.trim().split("@")

  if (
    name === undefined ||
    name.length === 0 ||
    domain === undefined ||
    domain.length === 0 ||
    extra !== undefined
  ) {
    return err(
      createLnurlPayRequestError({
        message: "Invalid Lightning address.",
      })
    )
  }

  return ok(
    new URL(
      `/.well-known/lnurlp/${encodeURIComponent(name)}`,
      `https://${domain}`
    )
  )
}

/**
 * Fetches an LNURL endpoint and returns its JSON body together with the HTTP
 * status and raw body for error reporting.
 *
 * An LNURL `{ status: "ERROR", reason }` body takes precedence over the HTTP
 * status (per LUD-06 it may arrive with any status code), then HTTP failures,
 * then a non-JSON body.
 */
const fetchLnurlJson =
  (
    url: string | URL,
    describe: string
  ): LnurlPayTask<{
    readonly json: unknown
    readonly status: number
    readonly responseBody: string
  }> =>
  async (run) => {
    const responseResult = await run(appFetchAsJson(url))
    if (!responseResult.ok) return responseResult

    const response = responseResult.value
    if (response.json.ok) {
      const lnurlError = LnurlErrorSchema.safeParse(response.json.value)
      if (lnurlError.success) {
        return err(
          createLnurlPayRequestError({ message: lnurlError.data.reason })
        )
      }
    }

    if (!response.ok) {
      return err(
        createLnurlPayHttpError({
          message: `${describe} request failed: ${response.status}`,
          status: response.status,
          responseBody: response.text,
        })
      )
    }

    if (!response.json.ok) {
      return err(
        createLnurlPayResponseError({
          message: `Invalid ${describe} response.`,
          status: response.status,
          responseBody: response.text,
          cause: response.json.error,
        })
      )
    }

    return ok({
      json: response.json.value,
      status: response.status,
      responseBody: response.text,
    })
  }

export const fetchLnurlPayMetadata =
  ({ address }: { readonly address: string }): LnurlPayTask<LnurlPayMetadata> =>
  async (run) => {
    const metadataUrl = createLud16MetadataUrl(address)
    if (!metadataUrl.ok) return metadataUrl

    const response = await run(
      fetchLnurlJson(metadataUrl.value, "LNURL metadata")
    )
    if (!response.ok) return response

    const metadata = LnurlPayMetadataSchema.safeParse(response.value.json)
    if (!metadata.success) {
      return err(
        createLnurlPayResponseError({
          message: "Invalid LNURL metadata response.",
          status: response.value.status,
          responseBody: response.value.responseBody,
          cause: metadata.error,
        })
      )
    }

    return ok({
      callback: metadata.data.callback,
      minSendableSats: metadata.data.minSendable / MSATS_PER_SAT,
      maxSendableSats: metadata.data.maxSendable / MSATS_PER_SAT,
    })
  }

export const fetchLnurlPayInvoice =
  ({
    amountSats,
    metadata,
  }: {
    readonly amountSats: number
    readonly metadata: LnurlPayMetadata
  }): LnurlPayTask<LnurlPayInvoice> =>
  async (run) => {
    const callbackUrl = new URL(metadata.callback)
    callbackUrl.searchParams.set("amount", String(amountSats * MSATS_PER_SAT))

    const response = await run(fetchLnurlJson(callbackUrl, "LNURL invoice"))
    if (!response.ok) return response

    const invoice = LnurlPayInvoiceSchema.safeParse(response.value.json)
    if (!invoice.success) {
      return err(
        createLnurlPayResponseError({
          message: "Invalid LNURL invoice response.",
          status: response.value.status,
          responseBody: response.value.responseBody,
          cause: invoice.error,
        })
      )
    }

    return ok({
      pr: invoice.data.pr,
      verify: invoice.data.verify,
    })
  }

export const fetchLnurlVerify =
  ({ verifyUrl }: { readonly verifyUrl: string }): LnurlPayTask<LnurlVerify> =>
  async (run) => {
    const response = await run(fetchLnurlJson(verifyUrl, "LNURL verify"))
    if (!response.ok) return response

    const verify = LnurlVerifySchema.safeParse(response.value.json)
    if (!verify.success) {
      return err(
        createLnurlPayResponseError({
          message: "Invalid LNURL verify response.",
          status: response.value.status,
          responseBody: response.value.responseBody,
          cause: verify.error,
        })
      )
    }

    return ok({
      settled: verify.data.settled,
      preimage: verify.data.preimage,
      pr: verify.data.pr,
    })
  }
