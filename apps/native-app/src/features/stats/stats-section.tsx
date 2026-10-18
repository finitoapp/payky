import { formatMoney } from "@payky/app-shared/format-money"
import { type Currency, Integer } from "@payky/core/modules/shared/schema"
import type { ReactNode } from "react"
import { Text, YStack } from "tamagui"
import { useLocale } from "../../hooks/use-translation.ts"

/** One block of the statistics screen: a titled card, an optional note under it. */
export function StatsSection({
  title,
  note,
  children,
}: {
  readonly title: string
  readonly note?: ReactNode
  readonly children: ReactNode
}) {
  return (
    <YStack gap="2">
      <YStack
        gap="3"
        p="3"
        rounded="lg"
        borderWidth={1}
        borderColor="border-color"
      >
        <Text fontWeight="700" accessibilityRole="header">
          {title}
        </Text>
        {children}
      </YStack>
      {note === undefined ? null : (
        <Text fontSize={12} color="muted-foreground">
          {note}
        </Text>
      )}
    </YStack>
  )
}

export const useStatsMoney = () => {
  const locale = useLocale()
  return (value: number, currency: Currency) =>
    formatMoney({ value: Integer(value), currency }, locale)
}

/** One currency's rows, headed by the currency when the period has several. */
export function CurrencyGroup({
  currency,
  showCurrency,
  children,
}: {
  readonly currency: Currency
  readonly showCurrency: boolean
  readonly children: ReactNode
}) {
  return (
    <YStack gap="3">
      {showCurrency ? (
        <Text fontSize={12} fontWeight="700" color="muted-foreground">
          {currency}
        </Text>
      ) : null}
      {children}
    </YStack>
  )
}
