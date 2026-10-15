import type {
  WithdrawalTarget,
  WithdrawalView,
} from "@/core/modules/withdraw/withdraw-queries.ts"
import type { TranslationKey } from "@/i18n/resources.ts"
import { shortenMiddle } from "@/lib/format-utils.ts"
import type { WithdrawMethod } from "./withdraw-flow.ts"

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

/** The wallet a withdrawal left. */
export const withdrawalMethod = (target: WithdrawalTarget): WithdrawMethod =>
  target.kind === "cashu" ? "cashu" : "spark"

export const withdrawalKindKeys = {
  onchain: "withdraw.kind.onchain",
  lightning: "withdraw.kind.lightning",
  cashu: "withdraw.kind.cashu",
} satisfies Record<WithdrawalTarget["kind"], TranslationKey>

/** A done on-chain withdrawal has only left the wallet; the chain may still be confirming it. */
export const withdrawalStatusKey = (view: WithdrawalView): TranslationKey => {
  if (view.state.status === "done") {
    return view.target.kind === "onchain"
      ? "withdraw.status.sent"
      : "withdraw.status.done"
  }
  return view.state.status === "failed"
    ? "withdraw.status.failed"
    : "withdraw.status.pending"
}

/** The destination as a person would retype it, for "New withdrawal". */
export const withdrawalDestination = (target: WithdrawalTarget): string =>
  target.kind === "onchain"
    ? target.onchainAddress
    : (target.lightningAddress ?? target.lnInvoice)

export const shortWithdrawalDestination = (target: WithdrawalTarget): string =>
  target.kind !== "onchain" && target.lightningAddress !== null
    ? target.lightningAddress
    : shortenMiddle(withdrawalDestination(target), 10, 6)

/** Tinted like the activity badges, so a state reads at a glance as well as in words. */
export const withdrawalStatusBadgeClassName = (
  status: WithdrawalView["state"]["status"]
): string =>
  ({
    done: "bg-success/10 text-success",
    failed: "bg-destructive/10 text-destructive",
    pending: "bg-warning/10 text-warning",
  })[status]

/**
 * What "New withdrawal" prefills: an address can take another payment, but a
 * Lightning invoice is single-use and has most likely expired by now.
 */
export const reusableWithdrawalDestination = (
  target: WithdrawalTarget
): string | null =>
  target.kind === "onchain" ? target.onchainAddress : target.lightningAddress
