import { createFileRoute, Outlet } from "@tanstack/react-router"

export const Route = createFileRoute("/_terminal/settings/stations")({
  component: StationsLayout,
})

function StationsLayout() {
  return <Outlet />
}
