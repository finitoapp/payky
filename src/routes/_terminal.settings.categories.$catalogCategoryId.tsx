import { createFileRoute } from "@tanstack/react-router"

import { EditCatalogCategoryPage } from "@/features/settings/categories/category-form-page.tsx"

export const Route = createFileRoute(
  "/_terminal/settings/categories/$catalogCategoryId"
)({
  component: RouteComponent,
  staticData: {
    terminalLayout: {
      viewportClassName: "px-3 py-6",
    },
  },
})

function RouteComponent() {
  const { catalogCategoryId } = Route.useParams()

  return <EditCatalogCategoryPage catalogCategoryId={catalogCategoryId} />
}
