import { err, ok, type Result } from "@evolu/common"
import { defineError } from "../../error.ts"
import {
  LIGHTNING_ADDRESS,
  lnurlToLightningAddress,
} from "../shared/lightning-address-utils.ts"
import {
  type LightningInvoice,
  type ParseLightningInvoiceError,
  parseLightningInvoice,
} from "../shared/lightning-invoice-utils.ts"
import { type BitcoinAddress, BitcoinAddressSchema } from "../shared/schema.ts"
import {
  normalizeBitcoinAddress,
  parseScannedBitcoinAddress,
} from "./bitcoin-uri-utils.ts"

export type LightningInvoiceDestination = {
  readonly kind: "lightning-invoice"
} & LightningInvoice

export type WithdrawDestination =
  | {
      readonly kind: "onchain"
      readonly address: BitcoinAddress
      readonly amountSats?: number
    }
  | LightningInvoiceDestination
  | { readonly kind: "lightning-address"; readonly address: string }
  | { readonly kind: "unsupported"; readonly reason: "spark" | "lnurl" }

const createInvalidWithdrawDestinationError = defineError(
  "InvalidWithdrawDestination"
)()
export type InvalidWithdrawDestinationError = ReturnType<
  typeof createInvalidWithdrawDestinationError
>

export type ParseWithdrawDestinationError =
  | InvalidWithdrawDestinationError
  | ParseLightningInvoiceError

const stripScheme = (value: string, scheme: string): string =>
  value.toLowerCase().startsWith(scheme) ? value.slice(scheme.length) : value

const parseInvoiceDestination = (
  raw: string
): Result<LightningInvoiceDestination, ParseLightningInvoiceError> => {
  const invoice = parseLightningInvoice(raw)
  return invoice.ok
    ? ok({ kind: "lightning-invoice", ...invoice.value })
    : invoice
}

/**
 * Recognizes what a merchant typed, pasted or scanned as a withdrawal
 * destination. Synchronous and free of the Spark SDK, so the form can answer
 * on every keystroke.
 */
export const parseWithdrawDestination = (
  raw: string
): Result<WithdrawDestination, ParseWithdrawDestinationError> => {
  const trimmed = raw.trim()
  const lower = trimmed.toLowerCase()

  if (lower.startsWith("bitcoin:")) {
    const scanned = parseScannedBitcoinAddress(trimmed)
    if (scanned === null) return err(createInvalidWithdrawDestinationError())
    if (scanned.lightning !== undefined) {
      return parseInvoiceDestination(scanned.lightning)
    }
    const address = BitcoinAddressSchema.safeParse(scanned.address)
    return address.success
      ? ok({
          kind: "onchain",
          address: address.data,
          amountSats: scanned.amountSats,
        })
      : err(createInvalidWithdrawDestinationError())
  }

  const withoutLightningScheme = stripScheme(lower, "lightning:")
  if (
    lower.startsWith("spark1") ||
    lower.startsWith("spark:") ||
    withoutLightningScheme.startsWith("spark1")
  ) {
    return ok({ kind: "unsupported", reason: "spark" })
  }
  if (withoutLightningScheme.startsWith("lnurl1")) {
    const address = lnurlToLightningAddress(withoutLightningScheme)
    return ok(
      address === null
        ? { kind: "unsupported", reason: "lnurl" }
        : { kind: "lightning-address", address }
    )
  }
  // Before the invoice prefix: a name such as `lnbits@getalby.com` starts
  // with "ln" too, and no invoice contains "@".
  if (LIGHTNING_ADDRESS.test(withoutLightningScheme)) {
    return ok({ kind: "lightning-address", address: withoutLightningScheme })
  }
  if (withoutLightningScheme.startsWith("ln")) {
    return parseInvoiceDestination(trimmed)
  }

  const address = BitcoinAddressSchema.safeParse(
    normalizeBitcoinAddress(trimmed)
  )
  return address.success
    ? ok({ kind: "onchain", address: address.data })
    : err(createInvalidWithdrawDestinationError())
}
