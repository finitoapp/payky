import { createFileRoute, Outlet } from "@tanstack/react-router"

export const Route = createFileRoute("/_terminal/settings/items")({
  staticData: { access: "settings" },
  component: ItemsLayout,
})

function ItemsLayout() {
  return <Outlet />
}
