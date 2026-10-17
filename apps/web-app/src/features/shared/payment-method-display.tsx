import type { AccountTransactionKind } from "@payky/core/modules/account-transaction/account-transaction-types"
import {
  BanknoteIcon,
  BitcoinIcon,
  CoinsIcon,
  CreditCardIcon,
  LandmarkIcon,
  type LucideIcon,
  ZapIcon,
} from "lucide-react"

/**
 * How the method that actually settled a payment (its claimed transaction's
 * `kind`) renders — as the payment detail's "Paid by" label and as the
 * activity list's per-row icon.
 */
export const paymentMethodIcon = {
  cashRegister: BanknoteIcon,
  iban: LandmarkIcon,
  onchain: BitcoinIcon,
  cardSwitchio: CreditCardIcon,
  spark: ZapIcon,
  cashu: CoinsIcon,
} satisfies Record<AccountTransactionKind, LucideIcon>
