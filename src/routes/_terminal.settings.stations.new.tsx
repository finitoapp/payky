import { createFileRoute } from "@tanstack/react-router"

import { NewStationPage } from "@/features/settings/stations/station-form-page.tsx"

export const Route = createFileRoute("/_terminal/settings/stations/new")({
  component: NewStationPage,
  staticData: {
    terminalLayout: {
      viewportClassName: "px-3 py-6",
    },
  },
})
