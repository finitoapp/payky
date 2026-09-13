import { csBill } from "@/i18n/cs/bill.ts"
import { csCommon } from "@/i18n/cs/common.ts"
import { csLanding } from "@/i18n/cs/landing.ts"
import { csOnboarding } from "@/i18n/cs/onboarding.ts"
import { csPayment } from "@/i18n/cs/payment.ts"
import { csSettings } from "@/i18n/cs/settings.ts"
import { csWithdraw } from "@/i18n/cs/withdraw.ts"
import type { TranslationKey } from "@/i18n/en.ts"

export const cs = {
  ...csSettings,
  ...csLanding,
  ...csBill,
  ...csPayment,
  ...csWithdraw,
  ...csOnboarding,
  ...csCommon,
} satisfies Record<TranslationKey, string>
