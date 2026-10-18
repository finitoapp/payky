import type { TranslationKey } from "@payky/app-shared/i18n/resources"
import {
  type NonEmptyString255,
  NonEmptyString255Schema,
} from "@payky/core/modules/shared/schema"

/**
 * The Fio API token is a secret: this validates what was typed and masks what
 * is shown afterwards, and holds nothing of the token beyond the call.
 */
export const parseFioToken = (
  raw: string
):
  | { readonly ok: true; readonly token: NonEmptyString255 }
  | { readonly ok: false; readonly errorKey: TranslationKey } => {
  const normalized = raw.trim()
  if (normalized === "") {
    return { ok: false, errorKey: "settings.fioPlugin.token.required" }
  }

  const result = NonEmptyString255Schema.safeParse(normalized)
  return result.success
    ? { ok: true, token: result.data }
    : { ok: false, errorKey: "settings.fioPlugin.token.invalid" }
}

/** Only the last four characters of a saved token are ever shown. */
export const maskFioToken = (token: string): string => {
  const suffix = token.slice(-4)
  return suffix === "" ? "********" : `********${suffix}`
}
