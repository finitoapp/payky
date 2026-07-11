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
import {
  FiatCurrency,
  type FiatCurrency as FiatCurrencyType,
} from "@/core/modules/shared/schema.ts"
import { OptionToggleGroup } from "@/features/settings/option-toggle-group.tsx"
import { useAppRun } from "@/hooks/use-app-run.ts"
import { useEvoluQuery } from "@/hooks/use-evolu-query.ts"
import { useTranslation } from "@/hooks/use-translation.ts"
import type { TranslationKey } from "@/i18n/resources.ts"

export const Route = createFileRoute("/_terminal/settings/fiat")({
  component: FiatCurrencyPage,
  staticData: {
    terminalLayout: {
      viewportClassName: "px-5 py-6",
    },
  },
})

interface FiatCurrencyOption {
  readonly value: FiatCurrencyType
  readonly label: TranslationKey
  readonly description: TranslationKey
}

const fiatCurrencyOptions: ReadonlyArray<FiatCurrencyOption> = [
  {
    value: FiatCurrency.EUR,
    label: "settings.fiat.eur.title",
    description: "settings.fiat.eur.description",
  },
  {
    value: FiatCurrency.USD,
    label: "settings.fiat.usd.title",
    description: "settings.fiat.usd.description",
  },
  {
    value: FiatCurrency.CZK,
    label: "settings.fiat.czk.title",
    description: "settings.fiat.czk.description",
  },
]

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
