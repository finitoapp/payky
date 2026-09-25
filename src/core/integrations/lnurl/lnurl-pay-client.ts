import { err, ok, type Result, type Task } from "@evolu/common"
import { z } from "zod"
import type { FetchDep } from "@/core/deps.ts"
import {
  createLnurlRequestError,
  fetchLnurlJson,
  type LnurlError,
  type LnurlRequestError,
  MSATS_PER_SAT,
} from "@/core/integrations/lnurl/lnurl-client.ts"

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

type LnurlPayTask<TResult> = Task<TResult, LnurlError, FetchDep>

export const createLud16MetadataUrl = (
  address: string
): Result<URL, LnurlRequestError> => {
  const [name, domain, extra] = address.trim().split("@")

  if (
    name === undefined ||
    name.length === 0 ||
    domain === undefined ||
    domain.length === 0 ||
    extra !== undefined
  ) {
    return err(
      createLnurlRequestError({
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
      // LUD-06 allows any positive msat integer, so the bounds need not land
      // on whole sats. Round inwards: a sat below the ceiled minimum or above
      // the floored maximum is one the recipient would reject.
      minSendableSats: Math.ceil(metadata.value.minSendable / MSATS_PER_SAT),
      maxSendableSats: Math.floor(metadata.value.maxSendable / MSATS_PER_SAT),
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
