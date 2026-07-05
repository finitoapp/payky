import { createFileRoute } from "@tanstack/react-router"
import { ReceiptText } from "lucide-react"
import { useEffect, useId, useState } from "react"

import { FadeHeader } from "@/components/fade-header.tsx"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field.tsx"
import { Input } from "@/components/ui/input.tsx"
import { updatePaymentLastNumber } from "@/core/modules/payment-number/payment-number-actions.ts"
import { paymentLastNumberQuery } from "@/core/modules/payment-number/payment-number-queries.ts"
import {
  getPaymentNumberSeries,
  updatePaymentNumberSeries,
} from "@/core/modules/payment-number-series/payment-number-series-actions.ts"
import { paymentNumberSeriesQuery } from "@/core/modules/payment-number-series/payment-number-series-queries.ts"
import { createDefaultPaymentNumberSeries } from "@/core/modules/payment-number-series/payment-number-series-utils.ts"
import {
  DateStringSchema,
  NonEmptyString255Schema,
  NonNegativeIntegerFromStringSchema,
  PositiveIntegerFromStringSchema,
} from "@/core/modules/shared/schema.ts"
import { OptionToggleGroup } from "@/features/settings/option-toggle-group.tsx"
import { SettingsFormCard } from "@/features/settings/settings-form-card.tsx"
import { useSettingsForm } from "@/features/settings/use-settings-form.ts"
import { useAppRun } from "@/hooks/use-app-run.ts"
import { useEvoluQuery } from "@/hooks/use-evolu-query.ts"
import { useTranslation } from "@/hooks/use-translation.ts"
import type { TranslationKey } from "@/i18n/resources.ts"

export const Route = createFileRoute(
  "/_terminal/settings/payment-number-series"
)({
  component: PaymentNumberSeriesPage,
  staticData: {
    terminalLayout: {
      viewportClassName: "px-5 py-6",
    },
  },
})

type YearFormat = "default" | "short"
type DatePartFormat = "default" | "hidden"

interface ToggleOption<Value extends string> {
  readonly value: Value
  readonly label: TranslationKey
  readonly description: TranslationKey
}

const yearFormatOptions: ReadonlyArray<ToggleOption<YearFormat>> = [
  {
    value: "default",
    label: "settings.paymentNumberSeries.year.default.title",
    description: "settings.paymentNumberSeries.year.default.description",
  },
  {
    value: "short",
    label: "settings.paymentNumberSeries.year.short.title",
    description: "settings.paymentNumberSeries.year.short.description",
  },
]

const monthFormatOptions: ReadonlyArray<ToggleOption<DatePartFormat>> = [
  {
    value: "default",
    label: "settings.paymentNumberSeries.month.default.title",
    description: "settings.paymentNumberSeries.month.default.description",
  },
  {
    value: "hidden",
    label: "settings.paymentNumberSeries.month.hidden.title",
    description: "settings.paymentNumberSeries.month.hidden.description",
  },
]

const dayFormatOptions: ReadonlyArray<ToggleOption<DatePartFormat>> = [
  {
    value: "default",
    label: "settings.paymentNumberSeries.day.default.title",
    description: "settings.paymentNumberSeries.day.default.description",
  },
  {
    value: "hidden",
    label: "settings.paymentNumberSeries.day.hidden.title",
    description: "settings.paymentNumberSeries.day.hidden.description",
  },
]

function PaymentNumberSeriesPage() {
  const appRun = useAppRun()
  const { t } = useTranslation()
  const prefixInputId = useId()
  const serialNumberDigitsInputId = useId()
  const lastSerialNumberInputId = useId()
  const lastNumberDateInputId = useId()
  const { data } = useEvoluQuery(paymentNumberSeriesQuery)
  const { data: paymentLastNumbers } = useEvoluQuery(paymentLastNumberQuery)
  const [storedSeries] = data
  const [paymentLastNumber] = paymentLastNumbers
  const series = storedSeries ?? createDefaultPaymentNumberSeries()
  const [prefix, setPrefix] = useState(series.prefix ?? "")
  const [serialNumberDigits, setSerialNumberDigits] = useState(
    String(series.serialNumberDigits)
  )
  const [lastSerialNumber, setLastSerialNumber] = useState(
    paymentLastNumber == null ? "0" : String(paymentLastNumber.serialNumber)
  )
  const [lastNumberDate, setLastNumberDate] = useState(
    paymentLastNumber?.date ?? ""
  )
  const [yearFormat, setYearFormat] = useState<YearFormat>(series.yearFormat)
  const [monthFormat, setMonthFormat] = useState<DatePartFormat>(
    series.monthFormat
  )
  const [dayFormat, setDayFormat] = useState<DatePartFormat>(series.dayFormat)
  const [serialNumberDigitsError, setSerialNumberDigitsError] =
    useState<TranslationKey | null>(null)
  const [prefixError, setPrefixError] = useState<TranslationKey | null>(null)
  const [lastSerialNumberError, setLastSerialNumberError] =
    useState<TranslationKey | null>(null)
  const [lastNumberDateError, setLastNumberDateError] =
    useState<TranslationKey | null>(null)
  const seriesForm = useSettingsForm()
  const lastNumberForm = useSettingsForm()

  useEffect(() => {
    setPrefix(series.prefix ?? "")
    setSerialNumberDigits(String(series.serialNumberDigits))
    setYearFormat(series.yearFormat)
    setMonthFormat(series.monthFormat)
    setDayFormat(series.dayFormat)
  }, [series])

  useEffect(() => {
    setLastSerialNumber(
      paymentLastNumber == null ? "0" : String(paymentLastNumber.serialNumber)
    )
    setLastNumberDate(paymentLastNumber?.date ?? "")
  }, [paymentLastNumber])

  useEffect(() => {
    if (storedSeries != null) return

    let cancelled = false

    const ensurePaymentNumberSeries = async () => {
      await using run = appRun()

      if (!cancelled) await run(getPaymentNumberSeries())
    }

    void ensurePaymentNumberSeries()

    return () => {
      cancelled = true
    }
  }, [appRun, storedSeries])

  return (
    <>
      <div className="h-6" />
      <FadeHeader title={t("settings.paymentNumberSeries.title")} />

      <div className="flex flex-col gap-4">
        <SettingsFormCard
          title={t("settings.paymentNumberSeries.lastNumber.title")}
          description={t("settings.paymentNumberSeries.lastNumber.description")}
          savedMessage={
            lastNumberForm.saved
              ? t("settings.paymentNumberSeries.lastNumber.saved")
              : null
          }
          submitLabel={t("settings.paymentNumberSeries.lastNumber.save")}
          pending={lastNumberForm.pending}
          onSubmit={(event) => {
            event.preventDefault()
            setLastSerialNumberError(null)
            setLastNumberDateError(null)
            lastNumberForm.resetSaved()

            const serialNumberResult =
              NonNegativeIntegerFromStringSchema.safeParse(lastSerialNumber)
            const trimmedDate = lastNumberDate.trim()
            const dateResult = trimmedDate
              ? DateStringSchema.safeParse(trimmedDate)
              : null

            if (!serialNumberResult.success) {
              setLastSerialNumberError(
                "settings.paymentNumberSeries.lastNumber.serialNumber.invalid"
              )
              return
            }

            if (dateResult?.success === false) {
              setLastNumberDateError(
                "settings.paymentNumberSeries.lastNumber.date.invalid"
              )
              return
            }

            void lastNumberForm.submit(async () => {
              await using run = appRun()

              await run(
                updatePaymentLastNumber({
                  serialNumber: serialNumberResult.data,
                  date: dateResult?.data ?? null,
                })
              )

              setLastNumberDate(trimmedDate)
            })
          }}
        >
          <FieldGroup>
            <Field data-invalid={lastSerialNumberError !== null}>
              <FieldLabel htmlFor={lastSerialNumberInputId}>
                {t(
                  "settings.paymentNumberSeries.lastNumber.serialNumber.label"
                )}
              </FieldLabel>
              <Input
                id={lastSerialNumberInputId}
                value={lastSerialNumber}
                disabled={lastNumberForm.pending}
                aria-invalid={lastSerialNumberError !== null}
                autoComplete="off"
                inputMode="numeric"
                onChange={(event) => {
                  setLastSerialNumber(event.currentTarget.value)
                  setLastSerialNumberError(null)
                  lastNumberForm.resetSaved()
                }}
              />
              <FieldDescription>
                {t(
                  "settings.paymentNumberSeries.lastNumber.serialNumber.description"
                )}
              </FieldDescription>
              <FieldError>
                {lastSerialNumberError ? t(lastSerialNumberError) : null}
              </FieldError>
            </Field>

            <Field data-invalid={lastNumberDateError !== null}>
              <FieldLabel htmlFor={lastNumberDateInputId}>
                {t("settings.paymentNumberSeries.lastNumber.date.label")}
              </FieldLabel>
              <Input
                id={lastNumberDateInputId}
                type="date"
                value={lastNumberDate}
                disabled={lastNumberForm.pending}
                aria-invalid={lastNumberDateError !== null}
                onChange={(event) => {
                  setLastNumberDate(event.currentTarget.value)
                  setLastNumberDateError(null)
                  lastNumberForm.resetSaved()
                }}
              />
              <FieldDescription>
                {t("settings.paymentNumberSeries.lastNumber.date.description")}
              </FieldDescription>
              <FieldError>
                {lastNumberDateError ? t(lastNumberDateError) : null}
              </FieldError>
            </Field>
          </FieldGroup>
        </SettingsFormCard>

        <SettingsFormCard
          title={t("settings.paymentNumberSeries.form.title")}
          description={t("settings.paymentNumberSeries.form.description")}
          savedMessage={
            seriesForm.saved ? t("settings.paymentNumberSeries.saved") : null
          }
          submitLabel={t("settings.paymentNumberSeries.save")}
          pending={seriesForm.pending}
          onSubmit={(event) => {
            event.preventDefault()
            setSerialNumberDigitsError(null)
            setPrefixError(null)
            seriesForm.resetSaved()

            const serialNumberDigitsResult =
              PositiveIntegerFromStringSchema.safeParse(serialNumberDigits)
            const trimmedPrefix = prefix.trim()
            const prefixResult = trimmedPrefix
              ? NonEmptyString255Schema.safeParse(trimmedPrefix)
              : null

            if (!serialNumberDigitsResult.success) {
              setSerialNumberDigitsError(
                "settings.paymentNumberSeries.serialNumberDigits.invalid"
              )
              return
            }

            if (prefixResult?.success === false) {
              setPrefixError("settings.paymentNumberSeries.prefix.invalid")
              return
            }

            void seriesForm.submit(async () => {
              await using run = appRun()

              await run(
                updatePaymentNumberSeries({
                  serialNumberDigits: serialNumberDigitsResult.data,
                  yearFormat,
                  monthFormat,
                  dayFormat,
                  prefix: prefixResult?.data ?? null,
                })
              )

              setPrefix(trimmedPrefix)
            })
          }}
        >
          <FieldGroup>
            <Field data-invalid={serialNumberDigitsError !== null}>
              <FieldLabel htmlFor={serialNumberDigitsInputId}>
                {t("settings.paymentNumberSeries.serialNumberDigits.label")}
              </FieldLabel>
              <Input
                id={serialNumberDigitsInputId}
                value={serialNumberDigits}
                disabled={seriesForm.pending}
                aria-invalid={serialNumberDigitsError !== null}
                autoComplete="off"
                inputMode="numeric"
                onChange={(event) => {
                  setSerialNumberDigits(event.currentTarget.value)
                  setSerialNumberDigitsError(null)
                  seriesForm.resetSaved()
                }}
              />
              <FieldDescription>
                {t(
                  "settings.paymentNumberSeries.serialNumberDigits.description"
                )}
              </FieldDescription>
              <FieldError>
                {serialNumberDigitsError ? t(serialNumberDigitsError) : null}
              </FieldError>
            </Field>

            <Field data-invalid={prefixError !== null}>
              <FieldLabel htmlFor={prefixInputId}>
                {t("settings.paymentNumberSeries.prefix.label")}
              </FieldLabel>
              <Input
                id={prefixInputId}
                value={prefix}
                disabled={seriesForm.pending}
                aria-invalid={prefixError !== null}
                autoComplete="off"
                onChange={(event) => {
                  setPrefix(event.currentTarget.value)
                  setPrefixError(null)
                  seriesForm.resetSaved()
                }}
              />
              <FieldDescription>
                {t("settings.paymentNumberSeries.prefix.description")}
              </FieldDescription>
              <FieldError>{prefixError ? t(prefixError) : null}</FieldError>
            </Field>

            <DateFormatField
              title={t("settings.paymentNumberSeries.year.label")}
              value={yearFormat}
              options={yearFormatOptions}
              disabled={seriesForm.pending}
              onValueChange={(value) => {
                setYearFormat(value)
                seriesForm.resetSaved()
              }}
            />
            <DateFormatField
              title={t("settings.paymentNumberSeries.month.label")}
              value={monthFormat}
              options={monthFormatOptions}
              disabled={seriesForm.pending}
              onValueChange={(value) => {
                setMonthFormat(value)
                seriesForm.resetSaved()
              }}
            />
            <DateFormatField
              title={t("settings.paymentNumberSeries.day.label")}
              value={dayFormat}
              options={dayFormatOptions}
              disabled={seriesForm.pending}
              onValueChange={(value) => {
                setDayFormat(value)
                seriesForm.resetSaved()
              }}
            />
          </FieldGroup>
        </SettingsFormCard>
      </div>
    </>
  )
}

function DateFormatField<Value extends string>({
  title,
  value,
  options,
  disabled,
  onValueChange,
}: {
  readonly title: string
  readonly value: Value
  readonly options: ReadonlyArray<ToggleOption<Value>>
  readonly disabled: boolean
  readonly onValueChange: (value: Value) => void
}) {
  const { t } = useTranslation()

  return (
    <Field>
      <FieldLabel>{title}</FieldLabel>
      <OptionToggleGroup
        value={value}
        options={options.map((option) => ({
          value: option.value,
          icon: ReceiptText,
          title: t(option.label),
          description: t(option.description),
        }))}
        disabled={disabled}
        onChange={onValueChange}
      />
    </Field>
  )
}
