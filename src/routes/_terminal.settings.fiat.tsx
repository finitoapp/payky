import { createFileRoute } from "@tanstack/react-router"
import { BadgeDollarSign } from "lucide-react"
import { FadeHeader } from "@/components/fade-header.tsx"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx"
import { updateSettings } from "@/core/modules/app-settings/app-settings-actions.ts"
import { settingsQuery } from "@/core/modules/app-settings/app-settings-queries.ts"
import { FiatCurrency } from "@/core/modules/shared/schema.ts"
import { fiatCurrencyOptions } from "@/features/settings/fiat-currency-options.ts"
import { OptionToggleGroup } from "@/features/settings/option-toggle-group.tsx"
import { useAppRun } from "@/hooks/use-app-run.ts"
import { useEvoluQuery } from "@/hooks/use-evolu-query.ts"
import { useTranslation } from "@/hooks/use-translation.ts"

export const Route = createFileRoute("/_terminal/settings/fiat")({
  component: FiatCurrencyPage,
  staticData: {
    terminalLayout: {
      viewportClassName: "px-5 py-6",
    },
  },
})

function FiatCurrencyPage() {
  const appRun = useAppRun()
  const { t } = useTranslation()
  const { data } = useEvoluQuery(settingsQuery)
  const [settings] = data
  const selectedCurrency = settings?.fiatCurrency ?? FiatCurrency.CZK

  return (
    <>
      <div className="h-6" />
      <FadeHeader title={t("settings.fiat.title")} />

      <Card>
        <CardHeader>
          <CardTitle>{t("settings.fiat.mode.title")}</CardTitle>
          <CardDescription>
            {t("settings.fiat.mode.description")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <OptionToggleGroup
            value={selectedCurrency}
            options={fiatCurrencyOptions.map((option) => ({
              value: option.value,
              icon: BadgeDollarSign,
              title: t(option.label),
              description: t(option.description),
            }))}
            onChange={async (fiatCurrency) => {
              await using run = appRun()

              await run(updateSettings({ fiatCurrency }))
            }}
          />
        </CardContent>
      </Card>
    </>
  )
}
