import { createFileRoute } from "@tanstack/react-router"

import { PosLoginPage } from "@/features/station/pos-login-page.tsx"

export const Route = createFileRoute("/pos")({
  component: PosLoginPage,
})
