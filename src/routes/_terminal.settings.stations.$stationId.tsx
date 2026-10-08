import { createFileRoute } from "@tanstack/react-router"

import { StationDetailPage } from "@/features/settings/stations/station-detail-page.tsx"

export const Route = createFileRoute("/_terminal/settings/stations/$stationId")(
  {
    component: RouteComponent,
    staticData: {
      terminalLayout: {
        viewportClassName: "px-3 py-6",
      },
    },
  }
)

function RouteComponent() {
  const { stationId } = Route.useParams()

  return <StationDetailPage stationId={stationId} />
}
