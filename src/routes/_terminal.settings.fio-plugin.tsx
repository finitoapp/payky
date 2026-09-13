import { createFileRoute } from "@tanstack/react-router"

import { FioPluginSettingsPage } from "@/features/settings/fio-plugin/fio-plugin-settings-page.tsx"

export const Route = createFileRoute("/_terminal/settings/fio-plugin")({
  component: FioPluginSettingsPage,
  staticData: {
    terminalLayout: {
      viewportClassName: "px-3 py-6",
    },
  },
})
