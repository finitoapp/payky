import { createFileRoute } from "@tanstack/react-router"

import { AccountsSettingsPage } from "@/features/settings/accounts/accounts-settings-page.tsx"

export const Route = createFileRoute("/_terminal/settings/accounts")({
  component: AccountsSettingsPage,
  staticData: {
    terminalLayout: {
      viewportClassName: "px-3 py-6",
    },
  },
})
