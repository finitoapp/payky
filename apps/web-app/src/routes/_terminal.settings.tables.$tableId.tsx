import { createFileRoute } from "@tanstack/react-router"

import { EditTablePage } from "@/features/settings/tables/table-form-page.tsx"

export const Route = createFileRoute("/_terminal/settings/tables/$tableId")({
  component: EditTableRoute,
  staticData: {
    access: "settings",
  },
})

function EditTableRoute() {
  const { tableId } = Route.useParams()

  return <EditTablePage tableId={tableId} />
}
