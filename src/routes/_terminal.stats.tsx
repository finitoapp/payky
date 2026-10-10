import { createFileRoute } from "@tanstack/react-router"

import { StatsPage } from "@/features/stats/stats-page.tsx"

export const Route = createFileRoute("/_terminal/stats")({
  component: StatsPage,
  staticData: {
    access: "stats",
  },
})
