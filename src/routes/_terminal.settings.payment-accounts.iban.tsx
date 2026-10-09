import { createFileRoute, Outlet } from "@tanstack/react-router"

export const Route = createFileRoute(
  "/_terminal/settings/payment-accounts/iban"
)({
  staticData: { access: "admin" },
  component: FiatBankAccountLayout,
})

function FiatBankAccountLayout() {
  return <Outlet />
}
