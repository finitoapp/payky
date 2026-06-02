import { createRun } from "@evolu/web"
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
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group.tsx"
import { updateSettings } from "@/core/modules/app-settings/app-settings-actions.ts"
import { settingsQuery } from "@/core/modules/app-settings/app-settings-queries.ts"
import {
  FiatCurrency,
  type FiatCurrency as FiatCurrencyType,
} from "@/core/modules/shared/schema.ts"
import { useEvolu } from "@/hooks/use-evolu.ts"
import { useEvoluQuery } from "@/hooks/use-evolu-query.ts"
import type { TranslationKey } from "@/i18n/resources.ts"
import { useTranslation } from "@/i18n/use-translation.ts"

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
    value: FiatCurrency.CZK,
    label: "settings.fiat.czk.title",
    description: "settings.fiat.czk.description",
  },
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
]

function FiatCurrencyPage() {
  const { t } = useTranslation()
  const evolu = useEvolu()
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
          <ToggleGroup<FiatCurrencyType>
            value={[selectedCurrency]}
            onValueChange={async (nextValue) => {
              const [fiatCurrency] = nextValue
              if (!fiatCurrency) return

              await using run = createRun({
                evolu,
                evoluOwnerId: evolu.appOwner.id,
              })

              await run(updateSettings({ fiatCurrency }))
            }}
            spacing={2}
            className="grid w-full grid-cols-1"
            orientation="vertical"
            variant="outline"
          >
            {fiatCurrencyOptions.map((option) => (
              <ToggleGroupItem
                key={option.value}
                value={option.value}
                className="flex justify-start px-6 py-4 gap-6 text-left h-auto"
              >
                <BadgeDollarSign className="text-muted-foreground" />
                <span className="flex flex-col gap-1">
                  <span className="font-semibold">{t(option.label)}</span>
                  <span className="text-xs leading-snug text-muted-foreground">
                    {t(option.description)}
                  </span>
                </span>
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </CardContent>
      </Card>
    </>
  )
}
