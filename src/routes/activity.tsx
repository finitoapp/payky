import { createFileRoute } from "@tanstack/react-router"

import { ActivityPage } from "@/pages.tsx"

export const Route = createFileRoute("/activity")({
  component: ActivityPage,
})
