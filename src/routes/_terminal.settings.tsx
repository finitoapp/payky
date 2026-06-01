import { createFileRoute, Outlet } from "@tanstack/react-router"

export const Route = createFileRoute("/_terminal/settings")({
  component: SettingsLayout,
})

function SettingsLayout() {
  return <Outlet />
}
