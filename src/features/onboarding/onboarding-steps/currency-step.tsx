import { BadgeDollarSign } from "lucide-react"

import {
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx"
import type { FiatCurrency as FiatCurrencyType } from "@/core/modules/shared/schema.ts"
import { fiatCurrencyOptions } from "@/features/settings/fiat-currency-options.ts"
import { OptionToggleGroup } from "@/features/settings/option-toggle-group.tsx"
import { useTranslation } from "@/hooks/use-translation.ts"

export function CurrencyStep({
  currency,
  pending,
  onSelect,
}: {
  readonly currency: FiatCurrencyType
  readonly pending: boolean
  readonly onSelect: (currency: FiatCurrencyType) => void
}) {
  const { t } = useTranslation()

  return (
    <>
      <CardHeader>
        <CardTitle>{t("settings.fiat.mode.title")}</CardTitle>
        <CardDescription>{t("settings.fiat.mode.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <OptionToggleGroup
          value={currency}
          options={fiatCurrencyOptions.map((option) => ({
            value: option.value,
            icon: BadgeDollarSign,
            title: t(option.label),
            description: t(option.description),
          }))}
          disabled={pending}
          onChange={onSelect}
        />
      </CardContent>
    </>
  )
}
