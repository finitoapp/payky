import { createFileRoute } from "@tanstack/react-router"

import { OnboardingPage } from "@/features/onboarding/onboarding-page.tsx"

export const Route = createFileRoute("/onboarding")({
  component: OnboardingPage,
})
