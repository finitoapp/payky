import { createFileRoute } from "@tanstack/react-router"

import { CategoriesSettingsPage } from "@/features/settings/categories/categories-settings-page.tsx"

export const Route = createFileRoute("/_terminal/settings/categories/")({
  component: CategoriesSettingsPage,
  staticData: {
    terminalLayout: {
      viewportClassName: "px-3 py-6",
    },
  },
})
