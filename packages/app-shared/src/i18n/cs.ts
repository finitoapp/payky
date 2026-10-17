import { csBill } from "./cs/bill.ts"
import { csCommon } from "./cs/common.ts"
import { csOnboarding } from "./cs/onboarding.ts"
import { csPayment } from "./cs/payment.ts"
import { csSettings } from "./cs/settings.ts"
import { csWithdraw } from "./cs/withdraw.ts"
import type { TranslationKey } from "./en.ts"

export const cs = {
  ...csSettings,
  ...csBill,
  ...csPayment,
  ...csWithdraw,
  ...csOnboarding,
  ...csCommon,
} satisfies Record<TranslationKey, string>
