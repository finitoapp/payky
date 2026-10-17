import {
  type AmountKeypadKey,
  amountKeypadKeys,
  applyAmountKey,
  formatAmountInput,
  getDecimalSeparator,
} from "@payky/app-shared/amount-entry"
import { decimalAmountToMinorUnits } from "@payky/core/modules/shared/money"
import {
  type FiatCurrency,
  NonNegativeInteger,
} from "@payky/core/modules/shared/schema"
import { router } from "expo-router"
import { atom, type PrimitiveAtom, useAtomValue, useSetAtom } from "jotai"
import { useRef, useState } from "react"
import { Pressable } from "react-native"
import { Text, XStack, YStack } from "tamagui"
import { AppButton } from "../../components/app-button.tsx"
import { useCreateTerminalPayment } from "../../hooks/use-create-terminal-payment.ts"
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
  tipsEnabled,
}: {
  readonly currency: FiatCurrency
  readonly tipsEnabled: boolean
}) {
  const [amountInputAtom] = useState(() => atom(""))

  return (
    <YStack flex={1} justify="space-between" gap="4">
      <AmountDisplay amountInputAtom={amountInputAtom} currency={currency} />
      <Keys amountInputAtom={amountInputAtom} currency={currency} />
      <ChargeButton
        amountInputAtom={amountInputAtom}
        currency={currency}
        tipsEnabled={tipsEnabled}
      />
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
  tipsEnabled,
}: {
  readonly amountInputAtom: AmountInputAtom
  readonly currency: FiatCurrency
  readonly tipsEnabled: boolean
}) {
  const { t } = useTranslation()
  const amountInput = useAtomValue(amountInputAtom)
  const amount = decimalAmountToMinorUnits({ currency, value: amountInput })
  const createTerminalPayment = useCreateTerminalPayment()
  const [pending, setPending] = useState(false)
  // The ref closes the window before `pending` re-renders: a double tap
  // creates one payment (web's `TerminalPaymentKeypad` does the same).
  const pendingRef = useRef(false)

  const charge = async (minor: number) => {
    if (pendingRef.current) return
    pendingRef.current = true
    setPending(true)
    try {
      const chargeAmount = NonNegativeInteger(minor)
      if (tipsEnabled) {
        router.push({
          pathname: "/payment/tip",
          params: { amount: String(chargeAmount), currency },
        })
      } else {
        await createTerminalPayment({
          amount: chargeAmount,
          currency,
          tipAmount: NonNegativeInteger(0),
        })
      }
    } finally {
      pendingRef.current = false
      setPending(false)
    }
  }

  return (
    <AppButton
      label={t("home.pay")}
      pending={pending}
      disabled={amount === null}
      onPress={() => {
        if (amount !== null) void charge(amount)
      }}
    />
  )
}
