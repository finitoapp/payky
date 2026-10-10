import { createFileRoute } from "@tanstack/react-router"

import { SettingsPage } from "@/features/settings/settings-page.tsx"

export const Route = createFileRoute("/_terminal/settings/")({
  component: SettingsPage,
  staticData: {
    access: "free",
    terminalLayout: {
      viewportClassName: "px-3 py-6",
    },
  },
})
