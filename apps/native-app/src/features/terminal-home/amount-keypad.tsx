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
import { Text, XStack, YStack } from "tamagui"
import { Button } from "../../components/ui/button.tsx"
import { useCreateTerminalPayment } from "../../hooks/use-create-terminal-payment.ts"
import { useLocale, useTranslation } from "../../hooks/use-translation.ts"
import { hapticButtonPress } from "../../platform/haptics.ts"
import { fontSize, fontWeight, radius } from "../../theme/tokens.ts"

type AmountInputAtom = PrimitiveAtom<string>

/**
 * The typed amount lives in a component-scoped atom passed down as a prop
 * (AGENTS.md; web's `TerminalPaymentKeypad` has the measurement), so a key
 * press re-renders only the display and the Charge button, not the keys.
 * `useState`, not `useMemo`: React may discard a memo and clear the amount.
 *
 * Drawn as web's `TerminalPaymentKeypad`: a spacer, the amount (`text-6xl
 * font-semibold tabular-nums`), the 3-column grid of round ghost keys
 * (`text-3xl`, rows `gap-y-10` around keys that overlap by `-m-6`) and the
 * round outline Charge button (`h-14 rounded-full text-base font-bold`),
 * spread over the height. Web's press bubble and amount bounce are motion
 * effects left out; a key shows the ghost press tint instead.
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
    <YStack flex={1} justify="space-between">
      <YStack />
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
    <YStack items="center">
      <Text
        accessibilityRole="header"
        fontSize="6xl"
        lineHeight="6xl"
        fontWeight={fontWeight.semibold}
        fontVariant={["tabular-nums"]}
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
    <YStack gap={16}>
      {rows.map((row) => (
        <XStack key={row.join("")}>
          {row.map((key) => (
            <KeypadKey
              key={key}
              label={label(key)}
              onKey={() => {
                hapticButtonPress()
                setAmountInput((current) =>
                  applyAmountKey(current, key, currency)
                )
              }}
            >
              {key === "." ? decimalSeparator : key}
            </KeypadKey>
          ))}
        </XStack>
      ))}
    </YStack>
  )
}

const PRESS_IN_EXPIRES_MS = 5000

/**
 * A key that types as the finger lands, as web's keypad does on
 * `pointerdown`, rather than on release: fast typing feels immediate. A
 * screen reader activates it without a touch, so `onPress` types only when
 * no `onPressIn` came just before it; a press the finger slid off of has
 * no `onPress`, and its stamp expires.
 * ponytail: holding a key past PRESS_IN_EXPIRES_MS types it again on release.
 */
function KeypadKey({
  label,
  children,
  onKey,
}: {
  readonly label: string
  readonly children: string
  readonly onKey: () => void
}) {
  const typedOnPressInAt = useRef<number | null>(null)
  return (
    <Button
      variant="ghost"
      flex={1}
      h={72}
      rounded={radius.full}
      accessibilityLabel={label}
      onPressIn={() => {
        typedOnPressInAt.current = Date.now()
        onKey()
      }}
      onPress={() => {
        const at = typedOnPressInAt.current
        typedOnPressInAt.current = null
        if (at === null || Date.now() - at > PRESS_IN_EXPIRES_MS) onKey()
      }}
    >
      <Text fontSize={fontSize["3xl"]} lineHeight={fontSize["3xl"]}>
        {children}
      </Text>
    </Button>
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
    <Button
      variant="outline"
      h={56}
      rounded={radius.full}
      accessibilityLabel={t("home.pay")}
      pending={pending}
      disabled={amount === null}
      onPress={() => {
        if (amount === null) return
        hapticButtonPress()
        void charge(amount)
      }}
    >
      <Text
        fontSize={fontSize.base}
        lineHeight={fontSize.base}
        fontWeight={fontWeight.bold}
      >
        {t("home.pay")}
      </Text>
    </Button>
  )
}
