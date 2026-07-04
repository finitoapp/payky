import { err, ok, type Result, type Task } from "@evolu/common"
import { z } from "zod"
import type { FetchDep } from "@/core/deps.ts"
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

type LnurlPayTask<TResult> = Task<TResult, LnurlPayRequestError, FetchDep>

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

export const fetchLnurlPayMetadata =
  ({ address }: { readonly address: string }): LnurlPayTask<LnurlPayMetadata> =>
  async (run) => {
    const metadataUrl = createLud16MetadataUrl(address)
    if (!metadataUrl.ok) return metadataUrl

    const response = await run.deps.fetch(metadataUrl.value, {
      signal: run.signal,
    })
    const body: unknown = await response.json()
    const lnurlError = LnurlErrorSchema.safeParse(body)

    if (lnurlError.success) {
      return err(
        createLnurlPayRequestError({ message: lnurlError.data.reason })
      )
    }

    if (!response.ok) {
      return err(
        createLnurlPayRequestError({
          message: `LNURL metadata request failed: ${response.status}`,
        })
      )
    }

    const metadata = LnurlPayMetadataSchema.safeParse(body)
    if (!metadata.success) {
      return err(
        createLnurlPayRequestError({
          message: "Invalid LNURL metadata response.",
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

    const response = await run.deps.fetch(callbackUrl, {
      signal: run.signal,
    })
    const body: unknown = await response.json()
    const lnurlError = LnurlErrorSchema.safeParse(body)

    if (lnurlError.success) {
      return err(
        createLnurlPayRequestError({ message: lnurlError.data.reason })
      )
    }

    if (!response.ok) {
      return err(
        createLnurlPayRequestError({
          message: `LNURL invoice request failed: ${response.status}`,
        })
      )
    }

    const invoice = LnurlPayInvoiceSchema.safeParse(body)
    if (!invoice.success) {
      return err(
        createLnurlPayRequestError({
          message: "Invalid LNURL invoice response.",
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
    const response = await run.deps.fetch(verifyUrl, {
      signal: run.signal,
    })
    const body: unknown = await response.json()
    const lnurlError = LnurlErrorSchema.safeParse(body)

    if (lnurlError.success) {
      return err(
        createLnurlPayRequestError({ message: lnurlError.data.reason })
      )
    }

    if (!response.ok) {
      return err(
        createLnurlPayRequestError({
          message: `LNURL verify request failed: ${response.status}`,
        })
      )
    }

    const verify = LnurlVerifySchema.safeParse(body)
    if (!verify.success) {
      return err(
        createLnurlPayRequestError({
          message: "Invalid LNURL verify response.",
        })
      )
    }

    return ok({
      settled: verify.data.settled,
      preimage: verify.data.preimage,
      pr: verify.data.pr,
    })
  }
