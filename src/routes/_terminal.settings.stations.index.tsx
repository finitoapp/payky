import { createFileRoute } from "@tanstack/react-router"

import { StationsSettingsPage } from "@/features/settings/stations/stations-settings-page.tsx"

export const Route = createFileRoute("/_terminal/settings/stations/")({
  component: StationsSettingsPage,
  staticData: {
    terminalLayout: {
      viewportClassName: "px-3 py-6",
    },
  },
})
