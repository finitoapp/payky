import { createFileRoute, Outlet } from "@tanstack/react-router"

export const Route = createFileRoute("/_terminal/settings/categories")({
  component: CategoriesLayout,
})

function CategoriesLayout() {
  return <Outlet />
}
