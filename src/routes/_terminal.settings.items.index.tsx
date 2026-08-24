import { createFileRoute } from "@tanstack/react-router"

import { ItemsSettingsPage } from "@/features/settings/items/items-settings-page.tsx"

export const Route = createFileRoute("/_terminal/settings/items/")({
  component: ItemsSettingsPage,
  staticData: {
    terminalLayout: {
      viewportClassName: "px-5 py-6",
    },
  },
})
