import { createFileRoute } from "@tanstack/react-router"

import { TablesSettingsPage } from "@/features/settings/tables/tables-settings-page.tsx"

export const Route = createFileRoute("/_terminal/settings/tables/")({
  component: TablesSettingsPage,
  staticData: {
    terminalLayout: {
      viewportClassName: "px-5 py-6",
    },
  },
})
