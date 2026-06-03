import { AccountId } from "@/core/modules/account/account-types.ts"
import type { InferTable } from "@/core/modules/shared/schema.ts"

export const defaultPaymentAccount = {
  id: AccountId,
} as const

export type DefaultPaymentAccountRow = InferTable<typeof defaultPaymentAccount>
