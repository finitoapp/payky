import { normalizeMintUrl } from "@payky/core/modules/cashu/cashu-utils"
import { createFileRoute } from "@tanstack/react-router"
import { z } from "zod"

import { CashuWithdrawPage } from "@/features/withdraw/cashu-withdraw-page.tsx"

// A malformed `destination` or `mint` only loses the prefill, so it falls
// back to none.
const CashuWithdrawNewSearchSchema = z.object({
  destination: z.string().optional().catch(undefined),
  mint: z.string().optional().catch(undefined),
})

export const Route = createFileRoute(
  "/_terminal/settings/payment-accounts/cashu/withdrawals/new"
)({
  component: CashuWithdrawNewRoute,
  validateSearch: (search) => CashuWithdrawNewSearchSchema.parse(search),
  staticData: {
    access: "admin",
  },
})

function CashuWithdrawNewRoute() {
  const { destination, mint } = Route.useSearch()
  return (
    <CashuWithdrawPage
      initialDestination={destination ?? ""}
      initialMint={mint === undefined ? null : normalizeMintUrl(mint)}
    />
  )
}
