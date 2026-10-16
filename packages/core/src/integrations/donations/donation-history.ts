import { z } from "zod"

/**
 * What `/api/donations` answers, shared by the handler that builds it and the
 * client that validates it. Imports nothing but zod, so the serverless
 * function can bundle it: no `@/` alias, no `app-env.ts`.
 */
export const DonationHistoryResponseSchema = z.object({
  items: z.array(
    z.object({
      amountSats: z.number().int().positive(),
      occurredAt: z.number().int().nonnegative(),
    })
  ),
  nextCursor: z.string().trim().min(1).nullable(),
})

export interface DonationHistoryItem {
  readonly amountSats: number
  readonly occurredAt: number
}

export interface DonationHistoryPage {
  readonly items: ReadonlyArray<DonationHistoryItem>
  readonly nextCursor: string | null
}
