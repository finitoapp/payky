import { createFileRoute } from "@tanstack/react-router"

import { EditTablePage } from "@/features/settings/tables/table-form-page.tsx"

export const Route = createFileRoute("/_terminal/settings/tables/$tableId")({
  component: RouteComponent,
  staticData: {
    terminalLayout: {
      viewportClassName: "px-5 py-6",
    },
  },
})

function RouteComponent() {
  const { tableId } = Route.useParams()

  return <EditTablePage tableId={tableId} />
}
