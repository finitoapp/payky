import { sqliteTrue } from "@evolu/common"
import { useNavigate } from "@tanstack/react-router"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import { FadeHeader } from "@/components/fade-header.tsx"
import { Button } from "@/components/ui/button.tsx"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field.tsx"
import { Input } from "@/components/ui/input.tsx"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group.tsx"
import { settingsQuery } from "@/core/modules/app-settings/app-settings-queries.ts"
import {
  parseTipFixedAmounts,
  parseTipPercentages,
} from "@/core/modules/app-settings/app-settings-tips.ts"
import {
  calculatePaymentAmounts,
  calculatePercentageTipAmount,
} from "@/core/modules/payment/payment-tip-utils.ts"
import { decimalAmountToMinorUnits } from "@/core/modules/shared/money.ts"
import {
  type FiatCurrency,
  NonNegativeInteger,
  type NonNegativeInteger as NonNegativeIntegerValue,
} from "@/core/modules/shared/schema.ts"
import { useCreateTerminalPayment } from "@/features/payment/use-create-terminal-payment.ts"
import { useEvoluQuery } from "@/hooks/use-evolu-query.ts"
import { useLocale } from "@/hooks/use-locale.ts"
import { useTranslation } from "@/hooks/use-translation.ts"
import { formatMoney } from "@/lib/format-utils.ts"

type TipSelection =
  | {
      readonly kind: "custom"
      readonly tipAmount: NonNegativeIntegerValue | null
    }
  | { readonly kind: "fixed"; readonly tipAmount: NonNegativeIntegerValue }
  | { readonly kind: "none"; readonly tipAmount: NonNegativeIntegerValue }
  | {
      readonly kind: "percentage"
      readonly percentage: number
      readonly tipAmount: NonNegativeIntegerValue
    }

interface PaymentTipPageProps {
  readonly amount: NonNegativeIntegerValue
  readonly currency: FiatCurrency
}

const tipOptionClassName =
  "h-[clamp(4.5rem,10dvh,6rem)] flex-col gap-1 py-3 text-lg"

export function PaymentTipPage({ amount, currency }: PaymentTipPageProps) {
  const { data } = useEvoluQuery(settingsQuery)
  const [settings] = data

  if (settings === undefined) return null

  return (
    <PaymentTipForm
      amount={amount}
      currency={currency}
      fixedAmounts={parseTipFixedAmounts(settings.presetTipFixedAmountsJson)}
      percentages={parseTipPercentages(settings.presetTipPercentagesJson)}
      tipsEnabled={settings.tipsEnabled === sqliteTrue}
    />
  )
}

function PaymentTipForm({
  amount,
  currency,
  fixedAmounts,
  percentages,
  tipsEnabled,
}: PaymentTipPageProps & {
  readonly fixedAmounts: ReadonlyArray<number>
  readonly percentages: ReadonlyArray<number>
  readonly tipsEnabled: boolean
}) {
  const navigate = useNavigate()
  const locale = useLocale()
  const { t } = useTranslation()
  const createTerminalPayment = useCreateTerminalPayment()
  const [selection, setSelection] = useState<TipSelection | null>(null)
  const [customTip, setCustomTip] = useState("")
  const customTipInputRef = useRef<HTMLInputElement>(null)
  const [customTipFocusRequest, setCustomTipFocusRequest] = useState(0)
  const [pending, setPending] = useState(false)
  const customTipAmount = decimalAmountToMinorUnits({
    currency,
    value: customTip,
  })
  const customTipInvalid = customTip.length > 0 && customTipAmount === null
  const selectedTipAmount = selection?.tipAmount ?? null
  const hasTipPresets = percentages.length > 0 || fixedAmounts.length > 0

  const formatAmount = (value: NonNegativeIntegerValue) =>
    formatMoney({ value, currency }, locale)

  const selectTip = (nextSelection: TipSelection | null) => {
    setSelection(nextSelection)
    if (nextSelection?.kind !== "custom") setCustomTip("")
  }

  useEffect(() => {
    if (!tipsEnabled) void navigate({ to: "/" })
  }, [navigate, tipsEnabled])

  useEffect(() => {
    if (customTipFocusRequest > 0) customTipInputRef.current?.focus()
  }, [customTipFocusRequest])

  const handleConfirm = async () => {
    if (selectedTipAmount === null || pending) return

    setPending(true)
    try {
      const paymentAmounts = calculatePaymentAmounts({
        amount,
        tipAmount: selectedTipAmount,
      })
      const created = await createTerminalPayment({
        ...paymentAmounts,
        currency,
      })
      if (!created) toast.error(t("paymentTip.create.error"))
    } finally {
      setPending(false)
    }
  }

  if (!tipsEnabled) return null

  return (
    <>
      <FadeHeader
        customStartAddonOnClick={() => {
          void navigate({ to: "/" })
        }}
      />

      <div className="flex h-full min-h-0 flex-col overflow-hidden pt-4">
        <section className="shrink-0 flex flex-col items-center gap-2 text-center">
          <p className="text-sm font-medium text-muted-foreground">
            {t("paymentTip.orderTotal")}
          </p>
          <h1 className="text-4xl font-semibold tracking-tight tabular-nums">
            {formatAmount(amount)}
          </h1>
        </section>

        <section className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-4">
          <div className="flex min-h-full flex-col justify-center gap-4">
            <h2 className="text-center text-md font-semibold tracking-tight">
              {t("paymentTip.title")}
            </h2>

            {hasTipPresets ? (
              <div className="flex flex-col gap-3">
                {percentages.length > 0 ? (
                  <ToggleGroup
                    aria-label={t("paymentTip.percentages")}
                    className="grid w-full grid-cols-2 gap-3"
                    value={
                      selection?.kind === "percentage"
                        ? [String(selection.percentage)]
                        : []
                    }
                    onValueChange={(values) => {
                      const [value] = values
                      const percentage = Number(value)
                      if (!percentages.includes(percentage)) {
                        selectTip(null)
                        return
                      }

                      selectTip({
                        kind: "percentage",
                        percentage,
                        tipAmount: calculatePercentageTipAmount({
                          amount,
                          percentage,
                        }),
                      })
                    }}
                  >
                    {percentages.map((percentage) => {
                      const tipAmount = calculatePercentageTipAmount({
                        amount,
                        percentage,
                      })
                      const totalAmount = calculatePaymentAmounts({
                        amount,
                        tipAmount,
                      }).amount

                      return (
                        <ToggleGroupItem
                          key={percentage}
                          value={String(percentage)}
                          variant="outline"
                          className={tipOptionClassName}
                        >
                          <span className="font-semibold">{percentage}%</span>
                          <span className="text-sm text-muted-foreground">
                            {formatAmount(totalAmount)}
                          </span>
                        </ToggleGroupItem>
                      )
                    })}
                  </ToggleGroup>
                ) : null}

                {fixedAmounts.length > 0 ? (
                  <ToggleGroup
                    aria-label={t("paymentTip.fixedAmounts")}
                    className="grid w-full grid-cols-2 gap-3"
                    value={
                      selection?.kind === "fixed"
                        ? [String(selection.tipAmount)]
                        : []
                    }
                    onValueChange={(values) => {
                      const [value] = values
                      const fixedAmount = fixedAmounts.find(
                        (preset) => preset === Number(value)
                      )
                      selectTip(
                        fixedAmount === undefined
                          ? null
                          : {
                              kind: "fixed",
                              tipAmount: NonNegativeInteger(fixedAmount),
                            }
                      )
                    }}
                  >
                    {fixedAmounts.map((fixedAmount) => {
                      const tipAmount = NonNegativeInteger(fixedAmount)
                      const totalAmount = calculatePaymentAmounts({
                        amount,
                        tipAmount,
                      }).amount

                      return (
                        <ToggleGroupItem
                          key={fixedAmount}
                          value={String(fixedAmount)}
                          variant="outline"
                          className={tipOptionClassName}
                        >
                          <span className="font-semibold">
                            +{formatAmount(tipAmount)}
                          </span>
                          <span className="text-sm text-muted-foreground">
                            {formatAmount(totalAmount)}
                          </span>
                        </ToggleGroupItem>
                      )
                    })}
                  </ToggleGroup>
                ) : null}
              </div>
            ) : null}

            <ToggleGroup
              aria-label={t("paymentTip.title")}
              className="grid w-full grid-cols-2 gap-3"
              value={
                selection?.kind === "custom"
                  ? ["custom"]
                  : selection?.kind === "none"
                    ? ["none"]
                    : []
              }
              onValueChange={(values) => {
                const [value] = values
                if (value === "custom") {
                  setSelection({
                    kind: "custom",
                    tipAmount:
                      customTipAmount === null
                        ? null
                        : NonNegativeInteger(customTipAmount),
                  })
                  setCustomTipFocusRequest((current) => current + 1)
                  return
                }
                if (value === "none") {
                  selectTip({
                    kind: "none",
                    tipAmount: NonNegativeInteger(0),
                  })
                  return
                }

                selectTip(null)
              }}
            >
              <ToggleGroupItem
                value="custom"
                variant="outline"
                className={tipOptionClassName}
              >
                <span className="font-semibold">
                  {t("paymentTip.custom.label")}
                </span>
                <span className="text-sm text-muted-foreground">
                  {t("paymentTip.custom.actionDescription")}
                </span>
              </ToggleGroupItem>
              <ToggleGroupItem
                value="none"
                variant="outline"
                className={tipOptionClassName}
              >
                <span className="font-semibold">{t("paymentTip.none")}</span>
                <span className="text-sm text-muted-foreground">
                  {formatAmount(amount)}
                </span>
              </ToggleGroupItem>
            </ToggleGroup>

            {selection?.kind === "custom" ? (
              <FieldGroup>
                <Field data-invalid={customTipInvalid}>
                  <FieldLabel htmlFor="custom-tip">
                    {t("paymentTip.custom.label")}
                  </FieldLabel>
                  <FieldDescription>
                    {t("paymentTip.custom.description")}
                  </FieldDescription>
                  <Input
                    id="custom-tip"
                    ref={customTipInputRef}
                    value={customTip}
                    inputMode="decimal"
                    autoComplete="off"
                    aria-invalid={customTipInvalid}
                    placeholder={t("paymentTip.custom.placeholder")}
                    onChange={(event) => {
                      const nextValue = event.currentTarget.value
                      const nextTipAmount = decimalAmountToMinorUnits({
                        currency,
                        value: nextValue,
                      })
                      setCustomTip(nextValue)
                      setSelection({
                        kind: "custom",
                        tipAmount:
                          nextTipAmount === null
                            ? null
                            : NonNegativeInteger(nextTipAmount),
                      })
                    }}
                  />
                  <FieldError>
                    {customTipInvalid ? t("paymentTip.custom.invalid") : null}
                  </FieldError>
                </Field>
              </FieldGroup>
            ) : null}
          </div>
        </section>

        <footer className="shrink-0 pt-4">
          <Button
            size="lg"
            className="h-14 w-full"
            disabled={selectedTipAmount === null || pending}
            onClick={() => {
              void handleConfirm()
            }}
          >
            {pending ? t("paymentTip.creating") : t("paymentTip.continue")}
          </Button>
        </footer>
      </div>
    </>
  )
}
