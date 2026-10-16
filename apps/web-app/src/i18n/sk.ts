import type { TranslationKey } from "@/i18n/en.ts"
import { skBill } from "@/i18n/sk/bill.ts"
import { skCommon } from "@/i18n/sk/common.ts"
import { skOnboarding } from "@/i18n/sk/onboarding.ts"
import { skPayment } from "@/i18n/sk/payment.ts"
import { skSettings } from "@/i18n/sk/settings.ts"
import { skWithdraw } from "@/i18n/sk/withdraw.ts"

export const sk = {
  ...skSettings,
  ...skBill,
  ...skPayment,
  ...skWithdraw,
  ...skOnboarding,
  ...skCommon,
} satisfies Record<TranslationKey, string>
