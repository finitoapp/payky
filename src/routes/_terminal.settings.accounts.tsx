import { createFileRoute, Outlet } from "@tanstack/react-router"

export const Route = createFileRoute("/_terminal/settings/accounts")({
  component: AccountsLayout,
})

function AccountsLayout() {
  return <Outlet />
}
