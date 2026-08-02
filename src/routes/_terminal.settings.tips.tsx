import { createFileRoute } from "@tanstack/react-router"

import { TipsSettingsPage } from "@/features/settings/tips/tips-settings-page.tsx"

export const Route = createFileRoute("/_terminal/settings/tips")({
  component: TipsSettingsPage,
  staticData: {
    terminalLayout: {
      viewportClassName: "px-5 py-6",
    },
  },
})
