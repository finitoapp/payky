import type { TranslationKey } from "@payky/app-shared/i18n/resources"
import {
  type BankQrFormat,
  BankQrFormatSchema,
} from "@payky/core/modules/account/account-types"
import { bankQrFormats } from "@payky/core/modules/payment/payment-iban-qr-payload-utils"
import {
  czechBankNameForIban,
  czechIbanToBban,
  isValidIban,
} from "@payky/core/modules/shared/iban-utils"
import {
  BankAccountInputIbanSchema,
  FiatCurrencySchema,
  type FiatCurrency as FiatCurrencyType,
} from "@payky/core/modules/shared/schema"
import { z } from "zod"

export type BankAccountDisplayFormat = "iban" | "bban"

export const formatBankAccount = {
  iban: (value: string) => value,
  // Czech accounts read as the account number people know them by; any other
  // IBAN has no such form and stays as it is.
  bban: (value: string) => czechIbanToBban(value) ?? value,
} satisfies Record<BankAccountDisplayFormat, (value: string) => string>

/**
 * The bank a Czech account belongs to as it is typed: `undefined` when the
 * input is not a valid Czech account (nothing to say), `null` when it is but
 * the bank code is unknown.
 */
export const czechBankForDraft = (draft: string): string | null | undefined => {
  const parsed = BankAccountInputIbanSchema.safeParse(draft)
  return parsed.success && parsed.data.startsWith("CZ")
    ? (czechBankNameForIban(parsed.data) ?? null)
    : undefined
}

/**
 * A codec's output side can't be a `.transform()` schema (`z.encode` runs it
 * backwards, and a transform has no backwards to run) — which rules out
 * `IbanSchema` itself, since it normalizes on the way in. This validates the
 * same way (`isValidIban`) without transforming; `decode` below does the
 * actual normalizing before handing off to it.
 */
const ValidatedIbanSchema = z.string().refine(isValidIban).brand<"Iban">()

/**
 * Accepts any bank account input format (IBAN or a Czech account number) and
 * normalizes to IBAN, same as the onboarding flow's validation — but as a
 * codec, so it can drive an `InlineEditField` directly. Blank means "not set
 * yet", matching `optionalDateCodec`'s shape. Decode never throws: an
 * unparseable value passes through untouched so `ValidatedIbanSchema` is the
 * one thing deciding valid vs. invalid, per this file's other codecs. One
 * codec per display format, since only `encode` differs.
 */
const createOptionalIbanCodec = (format: BankAccountDisplayFormat) =>
  z.codec(z.string(), ValidatedIbanSchema.nullable(), {
    decode: (value) => {
      const trimmed = value.trim()
      if (trimmed === "") return null

      const parsed = BankAccountInputIbanSchema.safeParse(trimmed)
      return parsed.success ? parsed.data : trimmed
    },
    encode: (value) => (value === null ? "" : formatBankAccount[format](value)),
  })

export const optionalIbanCodecs = {
  iban: createOptionalIbanCodec("iban"),
  bban: createOptionalIbanCodec("bban"),
} satisfies Record<BankAccountDisplayFormat, unknown>

// Every option value comes from a fixed, locally-built option list (never
// user input), so this cannot realistically fail — a decode error here would
// mean the codec and its options list disagree, not bad input.
export const fiatCurrencyCodec = z.codec(z.string(), FiatCurrencySchema, {
  decode: (value) => value as FiatCurrencyType,
  encode: (value) => value,
})

export const bankQrFormatCodec = z.codec(z.string(), BankQrFormatSchema, {
  decode: (value) => value as BankQrFormat,
  encode: (value) => value,
})

interface FiatBankAccountQrFormatOption {
  readonly value: BankQrFormat
  readonly label: TranslationKey
}

export const fiatBankAccountQrFormatOptions: ReadonlyArray<FiatBankAccountQrFormatOption> =
  bankQrFormats.map((format) => ({
    value: format,
    label: `settings.fiatBankAccount.qrFormat.${format}`,
  }))
