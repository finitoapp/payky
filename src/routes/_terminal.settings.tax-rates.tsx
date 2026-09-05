import { createFileRoute } from "@tanstack/react-router"

import { TaxRatesSettingsPage } from "@/features/settings/tax-rates/tax-rates-settings-page.tsx"

export const Route = createFileRoute("/_terminal/settings/tax-rates")({
  component: TaxRatesSettingsPage,
  staticData: {
    terminalLayout: {
      viewportClassName: "px-5 py-6",
    },
  },
})
