import { createFileRoute } from "@tanstack/react-router"

import { FiatBankAccountSettingsPage } from "@/features/settings/payment-accounts/fiat-bank-account-settings-page.tsx"

export const Route = createFileRoute(
  "/_terminal/settings/payment-accounts/iban/"
)({
  component: FiatBankAccountSettingsPage,
  staticData: {
    terminalLayout: {
      viewportClassName: "px-3 py-6",
    },
  },
})
