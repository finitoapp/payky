import { createFileRoute } from "@tanstack/react-router"

import { StationsOverview } from "@/features/activity/stations-overview.tsx"

export const Route = createFileRoute("/_terminal/activity_/stations")({
  component: StationsOverview,
  staticData: {
    terminalLayout: {
      viewportClassName: "px-3 py-6",
    },
  },
})
