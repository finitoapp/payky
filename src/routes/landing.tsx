import { createFileRoute } from "@tanstack/react-router"

import { LandingPage } from "@/features/landing/landing-page.tsx"

export const Route = createFileRoute("/landing")({
  component: LandingRoute,
})

function LandingRoute() {
  return <LandingPage />
}
