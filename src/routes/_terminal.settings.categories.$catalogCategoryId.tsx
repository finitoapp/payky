import { createFileRoute } from "@tanstack/react-router"

import { EditCatalogCategoryPage } from "@/features/settings/categories/category-form-page.tsx"

export const Route = createFileRoute(
  "/_terminal/settings/categories/$catalogCategoryId"
)({
  component: EditCategoryRoute,
  staticData: {
    access: "settings",
  },
})

function EditCategoryRoute() {
  const { catalogCategoryId } = Route.useParams()

  return <EditCatalogCategoryPage catalogCategoryId={catalogCategoryId} />
}
