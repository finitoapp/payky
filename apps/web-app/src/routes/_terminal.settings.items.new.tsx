import { createFileRoute } from "@tanstack/react-router"
import { z } from "zod"

import { NewCatalogItemPage } from "@/features/settings/items/item-form-page.tsx"

const NewCatalogItemSearchSchema = z.object({
  /** A code scanned on the items list that matched no item. */
  scan: z.string().optional().catch(undefined),
})

export const Route = createFileRoute("/_terminal/settings/items/new")({
  component: NewCatalogItemRoute,
  validateSearch: (search) => NewCatalogItemSearchSchema.parse(search),
  staticData: {
    access: "settings",
  },
})

function NewCatalogItemRoute() {
  const { scan } = Route.useSearch()
  return <NewCatalogItemPage initialScanCode={scan} />
}
