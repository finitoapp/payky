import { createFileRoute } from "@tanstack/react-router"

import { DebugConsoleSettingsPage } from "@/features/settings/debug-console/debug-console-settings-page.tsx"

export const Route = createFileRoute("/_terminal/settings/debug-console")({
  component: DebugConsoleSettingsPage,
  staticData: {
    terminalLayout: {
      viewportClassName: "px-3 py-6",
    },
  },
})
