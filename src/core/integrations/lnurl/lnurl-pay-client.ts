import { err, ok, type Result, type Task } from "@evolu/common"
import { z } from "zod"
import {
  appFetchAsJson,
  type FetchDep,
  type FetchError,
  validateJsonResponse,
} from "@/core/deps.ts"
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
 * Fetches an LNURL endpoint and validates its JSON body against `schema`.
 *
 * An LNURL `{ status: "ERROR", reason }` body takes precedence over the HTTP
 * status (per LUD-06 it may arrive with any status code), then HTTP failures,
 * then schema validation.
 */
const fetchLnurlJson =
  <TSchema extends z.ZodType>(
    url: string | URL,
    describe: string,
    schema: TSchema
  ): LnurlPayTask<z.output<TSchema>> =>
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

    return validateJsonResponse(response, {
      schema,
      onHttpError: ({ status, responseBody }) =>
        createLnurlPayHttpError({
          message: `${describe} request failed: ${status}`,
          status,
          responseBody,
        }),
      onResponseError: ({ status, responseBody, cause }) =>
        createLnurlPayResponseError({
          message: `Invalid ${describe} response.`,
          status,
          responseBody,
          cause,
        }),
    })
  }

export const fetchLnurlPayMetadata =
  ({ address }: { readonly address: string }): LnurlPayTask<LnurlPayMetadata> =>
  async (run) => {
    const metadataUrl = createLud16MetadataUrl(address)
    if (!metadataUrl.ok) return metadataUrl

    const metadata = await run(
      fetchLnurlJson(
        metadataUrl.value,
        "LNURL metadata",
        LnurlPayMetadataSchema
      )
    )
    if (!metadata.ok) return metadata

    return ok({
      callback: metadata.value.callback,
      minSendableSats: metadata.value.minSendable / MSATS_PER_SAT,
      maxSendableSats: metadata.value.maxSendable / MSATS_PER_SAT,
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

    const invoice = await run(
      fetchLnurlJson(callbackUrl, "LNURL invoice", LnurlPayInvoiceSchema)
    )
    if (!invoice.ok) return invoice

    return ok({
      pr: invoice.value.pr,
      verify: invoice.value.verify,
    })
  }

export const fetchLnurlVerify =
  ({ verifyUrl }: { readonly verifyUrl: string }): LnurlPayTask<LnurlVerify> =>
  async (run) => {
    const verify = await run(
      fetchLnurlJson(verifyUrl, "LNURL verify", LnurlVerifySchema)
    )
    if (!verify.ok) return verify

    return ok({
      settled: verify.value.settled,
      preimage: verify.value.preimage,
      pr: verify.value.pr,
    })
  }
