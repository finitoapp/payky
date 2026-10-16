import { createFileRoute } from "@tanstack/react-router"

import { EditCatalogItemPage } from "@/features/settings/items/item-form-page.tsx"

export const Route = createFileRoute(
  "/_terminal/settings/items/$catalogItemId"
)({
  component: EditItemRoute,
  staticData: {
    access: "settings",
  },
})

function EditItemRoute() {
  const { catalogItemId } = Route.useParams()

  return <EditCatalogItemPage catalogItemId={catalogItemId} />
}
