import { formatMoney } from "@payky/app-shared/format-money"
import type { TaxRecapRow } from "@payky/core/modules/bill-line/bill-line-tax-utils"
import { type Currency, Integer } from "@payky/core/modules/shared/schema"
import { taxRatePercentageToDecimalString } from "@payky/core/modules/tax-rate/tax-rate-utils"
import { Text, XStack, YStack } from "tamagui"
import { useLocale, useTranslation } from "../../hooks/use-translation.ts"

/** VAT breakdown by rate; nothing when no line carries a tax rate. */
export function TaxRecap({
  rows,
  currency,
}: {
  readonly rows: ReadonlyArray<TaxRecapRow>
  readonly currency: Currency
}) {
  const { t } = useTranslation()
  const locale = useLocale()
  const money = (value: number) =>
    formatMoney({ value: Integer(value), currency }, locale)

  return (
    <YStack gap="2">
      <Text fontSize={13} fontWeight="600" color="muted-foreground">
        {t("taxRecap.title")}
      </Text>
      {rows.map((row) => (
        <XStack key={row.taxRateId ?? "none"} justify="space-between" gap="3">
          <YStack flex={1}>
            <Text numberOfLines={1} fontWeight="600">
              {row.name === null || row.ratePercentage === null
                ? t("taxRecap.noTax")
                : t("taxRecap.rateLabel", {
                    name: row.name,
                    rate: taxRatePercentageToDecimalString(row.ratePercentage),
                  })}
            </Text>
            <Text fontSize={12} color="muted-foreground">
              {`${t("taxRecap.base")}: ${money(row.baseAmount)} · ${t("taxRecap.tax")}: ${money(row.taxAmount)}`}
            </Text>
          </YStack>
          <Text fontWeight="600">{money(row.grossAmount)}</Text>
        </XStack>
      ))}
    </YStack>
  )
}
