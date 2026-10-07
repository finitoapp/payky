import { createFileRoute, Navigate } from "@tanstack/react-router"
import { z } from "zod"

import { OnboardingPage } from "@/features/onboarding/onboarding-page.tsx"
import { LandingLanguageSchema } from "@/features/shared/landing-redirect.ts"
import { useIsStation } from "@/hooks/use-account-kind.ts"

const OnboardingSearchSchema = z.object({
  /** The language of the landing page the visitor came from (landing/0003). */
  lang: LandingLanguageSchema.optional().catch(undefined),
})

export const Route = createFileRoute("/onboarding")({
  component: OnboardingRoute,
  validateSearch: (search) => OnboardingSearchSchema.parse(search),
})

function OnboardingRoute() {
  const { lang } = Route.useSearch()
  // A station is set up by its owner's config, never here.
  if (useIsStation()) return <Navigate to="/" replace />
  return <OnboardingPage landingLanguage={lang} />
}
