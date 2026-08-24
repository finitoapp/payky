import { createFileRoute, Outlet } from "@tanstack/react-router"

export const Route = createFileRoute("/_terminal/settings/items")({
  component: ItemsLayout,
})

function ItemsLayout() {
  return <Outlet />
}
