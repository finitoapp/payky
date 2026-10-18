import type { WithdrawMethod } from "@payky/app-shared/withdraw-flow"

/** Where each wallet's withdrawal screens live (web's `withdrawRoutes`). */
export const withdrawRoutes = {
  spark: {
    history: "/withdraw",
    new: "/withdraw/new",
    detail: "/withdraw/[withdrawalId]",
  },
  cashu: {
    history: "/cashu-withdraw",
    new: "/cashu-withdraw/new",
    detail: "/cashu-withdraw/[withdrawalId]",
  },
} as const satisfies Record<
  WithdrawMethod,
  { readonly history: string; readonly new: string; readonly detail: string }
>
