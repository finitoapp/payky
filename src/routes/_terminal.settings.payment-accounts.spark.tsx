import { createFileRoute, Outlet } from "@tanstack/react-router"

export const Route = createFileRoute(
  "/_terminal/settings/payment-accounts/spark"
)({
  staticData: { access: "admin" },
  component: Outlet,
})
