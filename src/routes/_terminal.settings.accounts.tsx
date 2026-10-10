import { createFileRoute, Outlet } from "@tanstack/react-router"

export const Route = createFileRoute("/_terminal/settings/accounts")({
  staticData: { access: "admin" },
  component: Outlet,
})
