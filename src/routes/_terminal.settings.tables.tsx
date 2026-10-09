import { createFileRoute, Outlet } from "@tanstack/react-router"

export const Route = createFileRoute("/_terminal/settings/tables")({
  staticData: { access: "settings" },
  component: TablesLayout,
})

function TablesLayout() {
  return <Outlet />
}
