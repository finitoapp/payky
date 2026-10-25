import type { ProbeLightningAddressError } from "@payky/core/integrations/lnurl/lnurl-pay-client"
import { parseLightningAddress } from "@payky/core/modules/shared/lightning-address-utils"
import {
  type NonEmptyString255,
  NonEmptyString255Schema,
} from "@payky/core/modules/shared/schema"
import type { TranslationKey } from "./i18n/resources.ts"

/** The Lightning address a merchant typed into settings, lowercased. */
export const parseLightningAddressInput = (
  raw: string
):
  | { readonly ok: true; readonly address: NonEmptyString255 }
  | { readonly ok: false; readonly errorKey: TranslationKey } => {
  if (raw.trim() === "") {
    return { ok: false, errorKey: "settings.lightningAddress.address.required" }
  }
  const address = NonEmptyString255Schema.safeParse(parseLightningAddress(raw))
  return address.success
    ? { ok: true, address: address.data }
    : { ok: false, errorKey: "settings.lightningAddress.address.invalid" }
}

/** Why the address was refused when the merchant saved it. */
export const lightningAddressProbeErrorKeys = {
  LightningAddressVerifyUnsupported:
    "settings.lightningAddress.error.verifyUnsupported",
  LightningAddressInvoiceMismatch: "settings.lightningAddress.error.invalid",
  LnurlRequestError: "settings.lightningAddress.error.rejected",
  LnurlHttpError: "settings.lightningAddress.error.unreachable",
  LnurlResponseError: "settings.lightningAddress.error.invalid",
  FetchError: "settings.lightningAddress.error.unreachable",
} satisfies Record<ProbeLightningAddressError["type"], TranslationKey>
