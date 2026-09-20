import { createFileRoute } from "@tanstack/react-router"
import { z } from "zod"

import { OnboardingPage } from "@/features/onboarding/onboarding-page.tsx"

const OnboardingSearchSchema = z.object({
  /**
   * Set by the restore screen when a restored phrase brought no account
   * data: the account already exists, so the wizard skips choosing or
   * generating one and only collects the terminal settings.
   */
  restored: z.boolean().optional().default(false),
})

export const Route = createFileRoute("/onboarding")({
  component: OnboardingRoute,
  validateSearch: (search) => OnboardingSearchSchema.parse(search),
})

function OnboardingRoute() {
  const { restored } = Route.useSearch()

  return <OnboardingPage restoredAccountSetup={restored} />
}
