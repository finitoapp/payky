import { createFileRoute, Outlet } from "@tanstack/react-router"

export const Route = createFileRoute("/_terminal/settings/tables")({
  component: TablesLayout,
})

function TablesLayout() {
  return <Outlet />
}
