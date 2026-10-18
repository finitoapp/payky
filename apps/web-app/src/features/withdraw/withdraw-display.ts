import type { WithdrawMethod } from "@payky/app-shared/withdraw-flow"
import type { WithdrawalView } from "@payky/core/modules/withdraw/withdraw-queries"

/** Where each wallet's withdrawal screens live. */
export const withdrawRoutes = {
  spark: {
    history: "/settings/payment-accounts/spark/withdrawals",
    new: "/settings/payment-accounts/spark/withdrawals/new",
    detail: "/settings/payment-accounts/spark/withdrawals/$withdrawalId",
  },
  cashu: {
    history: "/settings/payment-accounts/cashu/withdrawals",
    new: "/settings/payment-accounts/cashu/withdrawals/new",
    detail: "/settings/payment-accounts/cashu/withdrawals/$withdrawalId",
  },
} as const satisfies Record<
  WithdrawMethod,
  { readonly history: string; readonly new: string; readonly detail: string }
>

/** Tinted like the activity badges, so a state reads at a glance as well as in words. */
export const withdrawalStatusBadgeClassName = (
  status: WithdrawalView["state"]["status"]
): string =>
  ({
    done: "bg-success/10 text-success",
    failed: "bg-destructive/10 text-destructive",
    pending: "bg-warning/10 text-warning",
  })[status]
