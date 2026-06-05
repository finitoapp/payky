import { createRun } from "@evolu/web"
import { createFileRoute } from "@tanstack/react-router"
import { ReceiptText } from "lucide-react"
import { useEffect, useId, useState } from "react"

import { FadeHeader } from "@/components/fade-header.tsx"
import { Button } from "@/components/ui/button.tsx"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field.tsx"
import { Input } from "@/components/ui/input.tsx"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group.tsx"
import {
  getPaymentNumberSeries,
  updatePaymentNumberSeries,
} from "@/core/modules/payment-number-series/payment-number-series-actions.ts"
import { paymentNumberSeriesQuery } from "@/core/modules/payment-number-series/payment-number-series-queries.ts"
import { createDefaultPaymentNumberSeries } from "@/core/modules/payment-number-series/payment-number-series-utils.ts"
import {
  NonEmptyString255Schema,
  PositiveIntegerFromStringSchema,
} from "@/core/modules/shared/schema.ts"
import { useEvolu } from "@/hooks/use-evolu.ts"
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
  const { t } = useTranslation()
  const evolu = useEvolu()
  const prefixInputId = useId()
  const serialNumberDigitsInputId = useId()
  const { data } = useEvoluQuery(paymentNumberSeriesQuery)
  const [storedSeries] = data
  const series = storedSeries ?? createDefaultPaymentNumberSeries()
  const [prefix, setPrefix] = useState(series.prefix ?? "")
  const [serialNumberDigits, setSerialNumberDigits] = useState(
    String(series.serialNumberDigits)
  )
  const [yearFormat, setYearFormat] = useState<YearFormat>(series.yearFormat)
  const [monthFormat, setMonthFormat] = useState<DatePartFormat>(
    series.monthFormat
  )
  const [dayFormat, setDayFormat] = useState<DatePartFormat>(series.dayFormat)
  const [serialNumberDigitsError, setSerialNumberDigitsError] =
    useState<TranslationKey | null>(null)
  const [prefixError, setPrefixError] = useState<TranslationKey | null>(null)
  const [saved, setSaved] = useState(false)
  const [pending, setPending] = useState(false)

  useEffect(() => {
    setPrefix(series.prefix ?? "")
    setSerialNumberDigits(String(series.serialNumberDigits))
    setYearFormat(series.yearFormat)
    setMonthFormat(series.monthFormat)
    setDayFormat(series.dayFormat)
  }, [series])

  useEffect(() => {
    if (storedSeries != null) return

    let cancelled = false

    const ensurePaymentNumberSeries = async () => {
      await using run = createRun({
        evolu,
        evoluOwnerId: evolu.appOwner.id,
      })

      if (!cancelled) await run(getPaymentNumberSeries())
    }

    void ensurePaymentNumberSeries()

    return () => {
      cancelled = true
    }
  }, [evolu, storedSeries])

  return (
    <>
      <div className="h-6" />
      <FadeHeader title={t("settings.paymentNumberSeries.title")} />

      <form
        onSubmit={async (event) => {
          event.preventDefault()
          setSerialNumberDigitsError(null)
          setPrefixError(null)
          setSaved(false)

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

          setPending(true)
          try {
            await using run = createRun({
              evolu,
              evoluOwnerId: evolu.appOwner.id,
            })

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
            setSaved(true)
          } finally {
            setPending(false)
          }
        }}
      >
        <Card>
          <CardHeader>
            <CardTitle>
              {t("settings.paymentNumberSeries.form.title")}
            </CardTitle>
            <CardDescription>
              {t("settings.paymentNumberSeries.form.description")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <Field data-invalid={serialNumberDigitsError !== null}>
                <FieldLabel htmlFor={serialNumberDigitsInputId}>
                  {t("settings.paymentNumberSeries.serialNumberDigits.label")}
                </FieldLabel>
                <Input
                  id={serialNumberDigitsInputId}
                  value={serialNumberDigits}
                  disabled={pending}
                  aria-invalid={serialNumberDigitsError !== null}
                  autoComplete="off"
                  inputMode="numeric"
                  onChange={(event) => {
                    setSerialNumberDigits(event.currentTarget.value)
                    setSerialNumberDigitsError(null)
                    setSaved(false)
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
                  disabled={pending}
                  aria-invalid={prefixError !== null}
                  autoComplete="off"
                  onChange={(event) => {
                    setPrefix(event.currentTarget.value)
                    setPrefixError(null)
                    setSaved(false)
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
                disabled={pending}
                onValueChange={(value) => {
                  setYearFormat(value)
                  setSaved(false)
                }}
              />
              <DateFormatField
                title={t("settings.paymentNumberSeries.month.label")}
                value={monthFormat}
                options={monthFormatOptions}
                disabled={pending}
                onValueChange={(value) => {
                  setMonthFormat(value)
                  setSaved(false)
                }}
              />
              <DateFormatField
                title={t("settings.paymentNumberSeries.day.label")}
                value={dayFormat}
                options={dayFormatOptions}
                disabled={pending}
                onValueChange={(value) => {
                  setDayFormat(value)
                  setSaved(false)
                }}
              />
            </FieldGroup>
          </CardContent>
          <CardFooter className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground" aria-live="polite">
              {saved ? t("settings.paymentNumberSeries.saved") : null}
            </p>
            <Button type="submit" disabled={pending}>
              {t("settings.paymentNumberSeries.save")}
            </Button>
          </CardFooter>
        </Card>
      </form>
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
      <ToggleGroup<Value>
        value={[value]}
        onValueChange={(nextValue) => {
          const [selectedValue] = nextValue
          if (!selectedValue) return

          onValueChange(selectedValue)
        }}
        spacing={2}
        className="grid w-full grid-cols-1"
        orientation="vertical"
        variant="outline"
        disabled={disabled}
      >
        {options.map((option) => (
          <ToggleGroupItem
            key={option.value}
            value={option.value}
            className="flex h-auto justify-start gap-6 px-6 py-4 text-left"
          >
            <ReceiptText className="text-muted-foreground" />
            <span className="flex flex-col gap-1">
              <span className="font-semibold">{t(option.label)}</span>
              <span className="text-xs leading-snug text-muted-foreground">
                {t(option.description)}
              </span>
            </span>
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </Field>
  )
}
