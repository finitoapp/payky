import { createFileRoute } from "@tanstack/react-router"

import { EditCatalogItemPage } from "@/features/settings/items/item-form-page.tsx"

export const Route = createFileRoute(
  "/_terminal/settings/items/$catalogItemId"
)({
  component: RouteComponent,
  staticData: {
    terminalLayout: {
      viewportClassName: "px-3 py-6",
    },
  },
})

function RouteComponent() {
  const { catalogItemId } = Route.useParams()

  return <EditCatalogItemPage catalogItemId={catalogItemId} />
}
