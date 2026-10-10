import {
  BanknoteIcon,
  BitcoinIcon,
  CreditCardIcon,
  LandmarkIcon,
  type LucideIcon,
  ZapIcon,
} from "lucide-react"

import type { AccountTransactionKind } from "@/core/modules/shared/schema.ts"
import type { TranslationKey } from "@/i18n/resources.ts"

/**
 * How the method that actually settled a payment (its claimed transaction's
 * `kind`) renders — as the payment detail's "Paid by" label and as the
 * activity list's per-row icon.
 */
export const paymentMethodLabelKey = {
  cashRegister: "paymentDetail.paymentMethod.cash",
  iban: "paymentDetail.paymentMethod.iban",
  onchain: "paymentDetail.paymentMethod.onchain",
  cardSwitchio: "paymentDetail.paymentMethod.card",
  spark: "paymentDetail.paymentMethod.spark",
} satisfies Record<AccountTransactionKind, TranslationKey>

export const paymentMethodIcon = {
  cashRegister: BanknoteIcon,
  iban: LandmarkIcon,
  onchain: BitcoinIcon,
  cardSwitchio: CreditCardIcon,
  spark: ZapIcon,
} satisfies Record<AccountTransactionKind, LucideIcon>
