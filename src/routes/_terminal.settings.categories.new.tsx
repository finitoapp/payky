import { createFileRoute } from "@tanstack/react-router"

import { NewCatalogCategoryPage } from "@/features/settings/categories/category-form-page.tsx"

export const Route = createFileRoute("/_terminal/settings/categories/new")({
  component: NewCatalogCategoryPage,
  staticData: {
    terminalLayout: {
      viewportClassName: "px-3 py-6",
    },
  },
})
