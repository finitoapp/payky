import { createFileRoute } from "@tanstack/react-router"

import { NewCatalogItemPage } from "@/features/settings/items/item-form-page.tsx"

export const Route = createFileRoute("/_terminal/settings/items/new")({
  component: NewCatalogItemPage,
  staticData: {
    terminalLayout: {
      viewportClassName: "px-3 py-6",
    },
  },
})
