import { enBill } from "@/i18n/en/bill.ts"
import { enCommon } from "@/i18n/en/common.ts"
import { enLanding } from "@/i18n/en/landing.ts"
import { enOnboarding } from "@/i18n/en/onboarding.ts"
import { enPayment } from "@/i18n/en/payment.ts"
import { enSettings } from "@/i18n/en/settings.ts"
import { enWithdraw } from "@/i18n/en/withdraw.ts"

/**
 * English is the source of truth for translation keys: `TranslationKey`
 * is derived from it, and `cs`/`sk` are checked against it per namespace
 * file as well as as a whole.
 */
export const en = {
  ...enSettings,
  ...enLanding,
  ...enBill,
  ...enPayment,
  ...enWithdraw,
  ...enOnboarding,
  ...enCommon,
} as const

export type TranslationKey = keyof typeof en
