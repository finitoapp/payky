import {
  type AmountKeypadKey,
  amountKeypadKeys,
  applyAmountKey,
  formatAmountInput,
  getDecimalSeparator,
} from "@payky/app-shared/amount-entry"
import { decimalAmountToMinorUnits } from "@payky/core/modules/shared/money"
import type { FiatCurrency } from "@payky/core/modules/shared/schema"
import { atom, type PrimitiveAtom, useAtomValue, useSetAtom } from "jotai"
import { useState } from "react"
import { Pressable } from "react-native"
import { Text, XStack, YStack } from "tamagui"
import { AppButton } from "../../components/app-button.tsx"
import { useLocale, useTranslation } from "../../hooks/use-translation.ts"

type AmountInputAtom = PrimitiveAtom<string>

/**
 * The typed amount lives in a component-scoped atom passed down as a prop
 * (AGENTS.md; web's `TerminalPaymentKeypad` has the measurement), so a key
 * press re-renders only the display and the Charge button, not the keys.
 * `useState`, not `useMemo`: React may discard a memo and clear the amount.
 */
export function AmountKeypad({
  currency,
}: {
  readonly currency: FiatCurrency
}) {
  const [amountInputAtom] = useState(() => atom(""))

  return (
    <YStack flex={1} justify="space-between" gap="4">
      <AmountDisplay amountInputAtom={amountInputAtom} currency={currency} />
      <Keys amountInputAtom={amountInputAtom} currency={currency} />
      <ChargeButton amountInputAtom={amountInputAtom} currency={currency} />
    </YStack>
  )
}

function AmountDisplay({
  amountInputAtom,
  currency,
}: {
  readonly amountInputAtom: AmountInputAtom
  readonly currency: FiatCurrency
}) {
  const amountInput = useAtomValue(amountInputAtom)
  const locale = useLocale()

  return (
    <YStack flex={1} items="center" justify="center">
      <Text
        accessibilityRole="header"
        fontSize={48}
        fontWeight="600"
        adjustsFontSizeToFit
        numberOfLines={1}
      >
        {formatAmountInput(amountInput, currency, locale)}
      </Text>
    </YStack>
  )
}

function Keys({
  amountInputAtom,
  currency,
}: {
  readonly amountInputAtom: AmountInputAtom
  readonly currency: FiatCurrency
}) {
  const { t } = useTranslation()
  const locale = useLocale()
  const setAmountInput = useSetAtom(amountInputAtom)
  const decimalSeparator = getDecimalSeparator(locale)

  const label = (key: AmountKeypadKey) =>
    key === "."
      ? t("home.keypad.decimal")
      : key === "<"
        ? t("home.keypad.backspace")
        : key

  const rows = [0, 3, 6, 9].map((start) =>
    amountKeypadKeys.slice(start, start + 3)
  )

  return (
    <YStack gap="2">
      {rows.map((row) => (
        <XStack key={row.join("")} gap="2">
          {row.map((key) => (
            <Pressable
              key={key}
              accessibilityRole="button"
              accessibilityLabel={label(key)}
              onPress={() => {
                setAmountInput((current) =>
                  applyAmountKey(current, key, currency)
                )
              }}
              style={{
                flex: 1,
                minHeight: 72,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text fontSize={30}>
                {key === "." ? decimalSeparator : key === "<" ? "⌫" : key}
              </Text>
            </Pressable>
          ))}
        </XStack>
      ))}
    </YStack>
  )
}

function ChargeButton({
  amountInputAtom,
  currency,
}: {
  readonly amountInputAtom: AmountInputAtom
  readonly currency: FiatCurrency
}) {
  const { t } = useTranslation()
  const amountInput = useAtomValue(amountInputAtom)
  const amount = decimalAmountToMinorUnits({ currency, value: amountInput })

  // Disabled until P02: Charge creates the payment and opens the tip/payment
  // screens (web's `useCreateTerminalPayment`), which do not exist natively,
  // so a created payment would be unreachable. `amount` is already the
  // validated minor-unit value that call takes.
  return (
    <AppButton
      label={t("home.pay")}
      disabled
      onPress={() => {
        void amount
      }}
    />
  )
}
