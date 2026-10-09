import { createFileRoute, Outlet } from "@tanstack/react-router"

export const Route = createFileRoute("/_terminal/settings")({
  staticData: { access: "free" },
  component: SettingsLayout,
})

function SettingsLayout() {
  return <Outlet />
}
