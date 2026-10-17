import type { TranslationKey } from "./en.ts"
import { skBill } from "./sk/bill.ts"
import { skCommon } from "./sk/common.ts"
import { skOnboarding } from "./sk/onboarding.ts"
import { skPayment } from "./sk/payment.ts"
import { skSettings } from "./sk/settings.ts"
import { skWithdraw } from "./sk/withdraw.ts"

export const sk = {
  ...skSettings,
  ...skBill,
  ...skPayment,
  ...skWithdraw,
  ...skOnboarding,
  ...skCommon,
} satisfies Record<TranslationKey, string>
