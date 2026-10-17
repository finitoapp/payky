import { sqliteTrue } from "@evolu/common"
import { formatMoney } from "@payky/app-shared/format-money"
import { settingsQuery } from "@payky/core/modules/app-settings/app-settings-queries"
import {
  parseTipFixedAmounts,
  parseTipPercentages,
} from "@payky/core/modules/app-settings/app-settings-tips"
import type { BillId } from "@payky/core/modules/bill/bill-types"
import {
  calculatePaymentAmounts,
  calculatePercentageTipAmount,
} from "@payky/core/modules/payment/payment-tip-utils"
import { decimalAmountToMinorUnits } from "@payky/core/modules/shared/money"
import {
  type FiatCurrency,
  NonNegativeInteger,
} from "@payky/core/modules/shared/schema"
import { Redirect, useLocalSearchParams } from "expo-router"
import { useRef, useState } from "react"
import { Pressable } from "react-native"
import { Text, XStack, YStack } from "tamagui"
import { AppButton } from "../../components/app-button.tsx"
import { Field } from "../../components/field.tsx"
import { Screen } from "../../components/screen.tsx"
import { EmptyView } from "../../components/state-views.tsx"
import { useCreateTerminalPayment } from "../../hooks/use-create-terminal-payment.ts"
import { useEvoluQuery } from "../../hooks/use-evolu-query.ts"
import { useLocale, useTranslation } from "../../hooks/use-translation.ts"
import { parseTipSearch } from "./tip-search.ts"

/** Web's tip step: the order total, preset tips, custom tip or none. */
export function PaymentTipPage() {
  const { t } = useTranslation()
  const params = useLocalSearchParams()
  const search = parseTipSearch(params)
  const [settings] = useEvoluQuery(settingsQuery).data

  if (search === null)
    return <EmptyView message={t("paymentTip.invalidLink")} />
  if (settings === undefined) return null
  // Tips switched off: nothing to choose, back to the keypad (as web).
  if (settings.tipsEnabled !== sqliteTrue) return <Redirect href="/" />

  return (
    <PaymentTipForm
      {...search}
      fixedAmounts={parseTipFixedAmounts(settings.presetTipFixedAmountsJson)}
      percentages={parseTipPercentages(settings.presetTipPercentagesJson)}
    />
  )
}

function PaymentTipForm({
  amount,
  currency,
  billId,
  fixedAmounts,
  percentages,
}: {
  readonly amount: NonNegativeInteger
  readonly currency: FiatCurrency
  readonly billId: BillId | null
  readonly fixedAmounts: ReadonlyArray<number>
  readonly percentages: ReadonlyArray<number>
}) {
  const { t } = useTranslation()
  const locale = useLocale()
  const createTerminalPayment = useCreateTerminalPayment()
  const [customOpen, setCustomOpen] = useState(false)
  const [customTip, setCustomTip] = useState("")
  const [pending, setPending] = useState(false)
  const pendingRef = useRef(false)

  const formatMinor = (value: number) =>
    formatMoney({ value: NonNegativeInteger(value), currency }, locale)
  const customMinor = decimalAmountToMinorUnits({
    currency,
    value: customTip,
  })
  const customInvalid = customTip.length > 0 && customMinor === null

  // One tap confirms: the ref closes the window before `pending` re-renders,
  // so a double tap cannot create two payments.
  const confirm = async (tipAmount: NonNegativeInteger) => {
    if (pendingRef.current) return
    pendingRef.current = true
    setPending(true)
    try {
      await createTerminalPayment({
        ...calculatePaymentAmounts({ amount, tipAmount }),
        currency,
        billId,
      })
    } finally {
      pendingRef.current = false
      setPending(false)
    }
  }

  const options = [
    ...percentages.map((percentage) => ({
      key: `p${percentage}`,
      label: t("settings.tips.percentages.value", { value: percentage }),
      tipAmount: calculatePercentageTipAmount({ amount, percentage }),
    })),
    ...fixedAmounts.map((fixed) => ({
      key: `f${fixed}`,
      label: `+${formatMinor(fixed)}`,
      tipAmount: NonNegativeInteger(fixed),
    })),
  ]

  return (
    <Screen>
      <YStack items="center" gap="2" pt="4">
        <Text color="muted-foreground">{t("paymentTip.orderTotal")}</Text>
        <Text fontSize={36} fontWeight="600" accessibilityRole="header">
          {formatMinor(amount)}
        </Text>
        <Text fontWeight="600" text="center">
          {t("paymentTip.title")}
        </Text>
      </YStack>

      <XStack flexWrap="wrap" gap="3">
        {options.map((option) => (
          <TipOption
            key={option.key}
            label={option.label}
            total={formatMinor(
              calculatePaymentAmounts({ amount, tipAmount: option.tipAmount })
                .amount
            )}
            disabled={pending}
            onPress={() => void confirm(option.tipAmount)}
          />
        ))}
        <TipOption
          label={t("paymentTip.custom.label")}
          total={t("paymentTip.custom.actionDescription")}
          disabled={pending}
          onPress={() => setCustomOpen(true)}
        />
        <TipOption
          label={t("paymentTip.none")}
          total={formatMinor(amount)}
          disabled={pending}
          onPress={() => void confirm(NonNegativeInteger(0))}
        />
      </XStack>

      {customOpen ? (
        <YStack gap="3">
          <Text color="muted-foreground">
            {t("paymentTip.custom.description")}
          </Text>
          <Field
            label={t("paymentTip.custom.label")}
            value={customTip}
            keyboardType="decimal-pad"
            autoComplete="off"
            disabled={pending}
            placeholder={t("paymentTip.custom.placeholder")}
            error={customInvalid ? t("paymentTip.custom.invalid") : undefined}
            onChangeText={setCustomTip}
          />
          <AppButton
            label={
              pending ? t("paymentTip.creating") : t("paymentTip.continue")
            }
            pending={pending}
            disabled={customMinor === null}
            onPress={() => {
              if (customMinor !== null)
                void confirm(NonNegativeInteger(customMinor))
            }}
          />
        </YStack>
      ) : null}
    </Screen>
  )
}

function TipOption({
  label,
  total,
  disabled,
  onPress,
}: {
  readonly label: string
  readonly total: string
  readonly disabled: boolean
  readonly onPress: () => void
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label} ${total}`}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={{
        flexBasis: "47%",
        flexGrow: 1,
        minHeight: 72,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 1,
        borderRadius: 12,
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <Text fontWeight="600">{label}</Text>
      <Text color="muted-foreground">{total}</Text>
    </Pressable>
  )
}
