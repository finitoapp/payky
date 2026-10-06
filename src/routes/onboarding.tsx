import { createFileRoute } from "@tanstack/react-router"
import { z } from "zod"

import { OnboardingPage } from "@/features/onboarding/onboarding-page.tsx"
import { LandingLanguageSchema } from "@/features/shared/landing-redirect.ts"

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
  return <OnboardingPage landingLanguage={lang} />
}
