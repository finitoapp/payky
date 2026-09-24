import { createFileRoute } from "@tanstack/react-router"
import { BadgeDollarSign } from "lucide-react"
import { FadeHeader } from "@/components/fade-header.tsx"
import { OptionToggleGroup } from "@/components/option-toggle-group.tsx"
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
import { fiatCurrencyOptions } from "@/features/shared/fiat-currency-options.ts"
import { useEvoluQuery } from "@/hooks/use-evolu-query.ts"
import { useRunToast } from "@/hooks/use-run-toast.ts"
import { useTranslation } from "@/hooks/use-translation.ts"

export const Route = createFileRoute("/_terminal/settings/fiat")({
  component: FiatCurrencyPage,
  staticData: {
    terminalLayout: {
      viewportClassName: "px-3 py-6",
    },
  },
})

function FiatCurrencyPage() {
  const runToast = useRunToast()
  const { t } = useTranslation()
  const { data } = useEvoluQuery(settingsQuery)
  const [settings] = data
  const selectedCurrency = settings?.fiatCurrency ?? FiatCurrency.CZK

  const saveFiatCurrency = (fiatCurrency: FiatCurrency) =>
    runToast(async (run) => {
      await run.ok(updateSettings({ fiatCurrency }))
    })

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
            }))}
            onChange={(fiatCurrency) => {
              void saveFiatCurrency(fiatCurrency)
            }}
          />
        </CardContent>
      </Card>
    </>
  )
}
