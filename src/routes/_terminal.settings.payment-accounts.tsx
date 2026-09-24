import { createFileRoute, Outlet } from "@tanstack/react-router"

export const Route = createFileRoute("/_terminal/settings/payment-accounts")({
  component: PaymentAccountsLayout,
})

function PaymentAccountsLayout() {
  return <Outlet />
}
