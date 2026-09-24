import { createFileRoute, Outlet } from "@tanstack/react-router"

export const Route = createFileRoute(
  "/_terminal/settings/payment-accounts/spark"
)({
  component: SparkAccountLayout,
})

function SparkAccountLayout() {
  return <Outlet />
}
