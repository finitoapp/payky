import { err, ok, type Result, type Task } from "@evolu/common"
import { z } from "zod"
import type { DateDep, FetchDep } from "../../deps.ts"
import { defineError } from "../../error.ts"
import {
  type LightningInvoice,
  parseLightningInvoice,
} from "../../modules/shared/lightning-invoice-utils.ts"
import { jsonCodec } from "../../zod-utils.ts"
import {
  createLnurlRequestError,
  fetchLnurlJson,
  type LnurlError,
  type LnurlRequestError,
  MSATS_PER_SAT,
} from "./lnurl-client.ts"

const LnurlPayMetadataSchema = z.object({
  tag: z.literal("payRequest"),
  callback: z.url(),
  minSendable: z.number().int().positive(),
  maxSendable: z.number().int().positive(),
  metadata: z.string(),
  // LUD-12: the longest comment the recipient accepts; absent means none.
  commentAllowed: z.number().int().nonnegative().optional().catch(undefined),
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

// LUD-06: `metadata` is a JSON array of `[mime, content]` pairs.
const LnurlMetadataEntriesCodec = jsonCodec(
  z.array(z.tuple([z.string(), z.unknown()]).rest(z.unknown()))
)

/**
 * The invoice a Lightning address returned is not the one asked for, or the
 * address would be reached over plain `http:`. Nothing is paid then
 * (withdraw/0005).
 */
const createLightningAddressInvoiceMismatchError = defineError(
  "LightningAddressInvoiceMismatch"
)<{ readonly message: string }>()
export type LightningAddressInvoiceMismatchError = ReturnType<
  typeof createLightningAddressInvoiceMismatchError
>

export interface LnurlPayMetadata {
  readonly callback: string
  readonly minSendableSats: number
  readonly maxSendableSats: number
  /** The recipient's `text/plain` entry, shown on review in place of the invoice's description. */
  readonly text?: string | null
  /** LUD-12: the longest comment the recipient accepts, 0 when it takes none. */
  readonly commentAllowed?: number
}

export interface LnurlPayInvoice {
  readonly pr: string
  readonly verify?: string
  readonly invoice: LightningInvoice
}

export interface LnurlVerify {
  readonly settled: boolean
  readonly preimage: string | null
  readonly pr: string
}

type LnurlPayTask<TResult, TDeps = FetchDep> = Task<
  TResult,
  LnurlError | LightningAddressInvoiceMismatchError,
  TDeps
>

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

    // Only TLS authenticates the recipient: `description_hash` commits to
    // public metadata anyone can copy (withdraw/0005).
    if (new URL(metadata.value.callback).protocol !== "https:") {
      return err(
        createLightningAddressInvoiceMismatchError({
          message: "The LNURL callback is not https.",
        })
      )
    }

    const entries = LnurlMetadataEntriesCodec.safeDecode(
      metadata.value.metadata
    )
    const text = entries.success
      ? entries.data.find(
          (entry): entry is [string, string] =>
            entry[0] === "text/plain" && typeof entry[1] === "string"
        )?.[1]
      : undefined

    return ok({
      callback: metadata.value.callback,
      text: text === undefined || text.trim() === "" ? null : text,
      // LUD-06 allows any positive msat integer, so the bounds need not land
      // on whole sats. Round inwards: a sat below the ceiled minimum or above
      // the floored maximum is one the recipient would reject.
      minSendableSats: Math.ceil(metadata.value.minSendable / MSATS_PER_SAT),
      maxSendableSats: Math.floor(metadata.value.maxSendable / MSATS_PER_SAT),
      commentAllowed: metadata.value.commentAllowed ?? 0,
    })
  }

/**
 * The LUD-12 comment the recipient would get: trimmed, cut to
 * `commentAllowed` characters, `null` when empty or not accepted.
 */
export const lnurlPayComment = (
  metadata: Pick<LnurlPayMetadata, "commentAllowed">,
  comment: string | undefined
): string | null => {
  const allowed = metadata.commentAllowed ?? 0
  const trimmed = Array.from(comment?.trim() ?? "")
    .slice(0, allowed)
    .join("")
    .trim()
  return trimmed === "" ? null : trimmed
}

/**
 * Fetches an invoice and checks it is the one asked for: the exact msat
 * amount, mainnet, not expired. `description_hash` is deliberately not
 * checked (withdraw/0005). A `comment` goes along as LUD-12's `comment`
 * only as far as `lnurlPayComment` lets it.
 */
export const fetchLnurlPayInvoice =
  ({
    amountSats,
    metadata,
    comment,
  }: {
    readonly amountSats: number
    readonly metadata: LnurlPayMetadata
    readonly comment?: string
  }): LnurlPayTask<LnurlPayInvoice, FetchDep & DateDep> =>
  async (run) => {
    const amountMsat = amountSats * MSATS_PER_SAT
    const callbackUrl = new URL(metadata.callback)
    if (callbackUrl.protocol !== "https:") {
      return err(
        createLightningAddressInvoiceMismatchError({
          message: "The LNURL callback is not https.",
        })
      )
    }
    callbackUrl.searchParams.set("amount", String(amountMsat))
    const sentComment = lnurlPayComment(metadata, comment)
    if (sentComment !== null) {
      callbackUrl.searchParams.set("comment", sentComment)
    }

    const response = await run(
      fetchLnurlJson(callbackUrl, "LNURL invoice", LnurlPayInvoiceSchema)
    )
    if (!response.ok) return response

    const invoice = parseLightningInvoice(response.value.pr)
    if (!invoice.ok) {
      return err(
        createLightningAddressInvoiceMismatchError({
          message: `The returned invoice is not a mainnet invoice (${invoice.error.type}).`,
        })
      )
    }
    if (invoice.value.amountMsat !== BigInt(amountMsat)) {
      return err(
        createLightningAddressInvoiceMismatchError({
          message: "The returned invoice is for a different amount.",
        })
      )
    }
    if (invoice.value.expiresAt <= run.deps.date.now().getTime()) {
      return err(
        createLightningAddressInvoiceMismatchError({
          message: "The returned invoice has already expired.",
        })
      )
    }

    return ok({
      pr: response.value.pr,
      verify: response.value.verify,
      invoice: invoice.value,
    })
  }

/**
 * One LUD-21 poll of `verifyUrl`. Like the callback, it must be `https`: its
 * answer decides whether a payment counts as paid (lightning-address/0002).
 */
export const fetchLnurlVerify =
  ({ verifyUrl }: { readonly verifyUrl: string }): LnurlPayTask<LnurlVerify> =>
  async (run) => {
    if (!URL.canParse(verifyUrl) || new URL(verifyUrl).protocol !== "https:") {
      return err(
        createLightningAddressInvoiceMismatchError({
          message: "The LNURL verify URL is not https.",
        })
      )
    }

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

/**
 * The Lightning address hands out invoices without a LUD-21 `verify` URL, so
 * Payky could never tell when one is paid (lightning-address/0003).
 */
export const createLightningAddressVerifyUnsupportedError = defineError(
  "LightningAddressVerifyUnsupported"
)()
export type LightningAddressVerifyUnsupportedError = ReturnType<
  typeof createLightningAddressVerifyUnsupportedError
>

/**
 * Checks a Lightning address can take payments Payky tracks: its metadata
 * loads and an invoice for `minSendable` comes with a `verify` URL. Whether
 * the wallet then reveals the preimage shows only once a payment is paid.
 */
export const probeLightningAddress =
  ({
    address,
  }: {
    readonly address: string
  }): Task<
    LnurlPayMetadata,
    | LnurlError
    | LightningAddressInvoiceMismatchError
    | LightningAddressVerifyUnsupportedError,
    FetchDep & DateDep
  > =>
  async (run) => {
    const metadata = await run(fetchLnurlPayMetadata({ address }))
    if (!metadata.ok) return metadata

    const invoice = await run(
      fetchLnurlPayInvoice({
        amountSats: metadata.value.minSendableSats,
        metadata: metadata.value,
      })
    )
    if (!invoice.ok) return invoice
    if (invoice.value.verify === undefined) {
      return err(createLightningAddressVerifyUnsupportedError())
    }

    return ok(metadata.value)
  }
