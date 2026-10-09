import { createFileRoute } from "@tanstack/react-router"

import { HomeScreenSettingsPage } from "@/features/settings/home-screen/home-screen-settings-page.tsx"

export const Route = createFileRoute("/_terminal/settings/home-screen")({
  component: HomeScreenSettingsPage,
  staticData: {
    access: "settings",
    terminalLayout: {
      viewportClassName: "px-3 py-6",
    },
  },
})
