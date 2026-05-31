import { createFileRoute, Outlet } from "@tanstack/react-router"

export const Route = createFileRoute("/settings")({
  component: SettingsLayout,
})

function SettingsLayout() {
  return <Outlet />
}
