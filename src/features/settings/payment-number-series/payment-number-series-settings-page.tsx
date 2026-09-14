import { ReceiptText } from "lucide-react"
import { useMemo } from "react"

import { FadeHeader } from "@/components/fade-header.tsx"
import type { OptionToggleGroupOption } from "@/components/option-toggle-group.tsx"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx"
import { FieldGroup } from "@/components/ui/field.tsx"
import { updatePaymentLastNumber } from "@/core/modules/payment-number/payment-number-actions.ts"
import { paymentLastNumberQuery } from "@/core/modules/payment-number/payment-number-queries.ts"
import type { PaymentNumberSeriesRow } from "@/core/modules/payment-number-series/payment-number-series.ts"
import { updatePaymentNumberSeries } from "@/core/modules/payment-number-series/payment-number-series-actions.ts"
import { paymentNumberSeriesQuery } from "@/core/modules/payment-number-series/payment-number-series-queries.ts"
import { createDefaultPaymentNumberSeries } from "@/core/modules/payment-number-series/payment-number-series-utils.ts"
import { NonNegativeInteger } from "@/core/modules/shared/schema.ts"
import {
  nonNegativeIntegerCodec,
  optionalDateCodec,
  optionalTextCodec,
  positiveIntegerCodec,
} from "@/features/settings/inline-edit-codecs.ts"
import { InlineEditField } from "@/features/settings/inline-edit-field.tsx"
import { InlineEditToggleGroup } from "@/features/settings/inline-edit-toggle-group.tsx"
import { useAppRun } from "@/hooks/use-app-run.ts"
import { useEvoluQuery } from "@/hooks/use-evolu-query.ts"
import { useTranslation } from "@/hooks/use-translation.ts"
import type { TranslationKey } from "@/i18n/resources.ts"

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

export function PaymentNumberSeriesSettingsPage() {
  const { t } = useTranslation()

  return (
    <>
      <div className="h-6" />
      <FadeHeader title={t("settings.paymentNumberSeries.title")} />

      <div className="flex flex-col gap-4">
        <LastNumberCard />
        <SeriesFormatCard />
      </div>
    </>
  )
}

function LastNumberCard() {
  const appRun = useAppRun()
  const { t } = useTranslation()
  const { data } = useEvoluQuery(paymentLastNumberQuery)
  const [paymentLastNumber] = data

  const serialNumber = paymentLastNumber?.serialNumber ?? NonNegativeInteger(0)
  const date = paymentLastNumber?.date ?? null

  // `updatePaymentLastNumber` writes the whole row, so each field carries the
  // other one along unchanged.
  const save = async (values: {
    readonly serialNumber: typeof serialNumber
    readonly date: typeof date
  }) => {
    await using run = appRun()
    await run(updatePaymentLastNumber(values))
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {t("settings.paymentNumberSeries.lastNumber.title")}
        </CardTitle>
        <CardDescription>
          {t("settings.paymentNumberSeries.lastNumber.description")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <InlineEditField
            label={t(
              "settings.paymentNumberSeries.lastNumber.serialNumber.label"
            )}
            description={t(
              "settings.paymentNumberSeries.lastNumber.serialNumber.description"
            )}
            inputMode="numeric"
            defaultValue={serialNumber}
            codec={nonNegativeIntegerCodec}
            errorKey="settings.paymentNumberSeries.lastNumber.serialNumber.invalid"
            onSave={(nextSerialNumber) =>
              save({ serialNumber: nextSerialNumber, date })
            }
          />

          <InlineEditField
            label={t("settings.paymentNumberSeries.lastNumber.date.label")}
            description={t(
              "settings.paymentNumberSeries.lastNumber.date.description"
            )}
            type="date"
            defaultValue={date}
            codec={optionalDateCodec}
            errorKey="settings.paymentNumberSeries.lastNumber.date.invalid"
            onSave={(nextDate) => save({ serialNumber, date: nextDate })}
          />
        </FieldGroup>
      </CardContent>
    </Card>
  )
}

function SeriesFormatCard() {
  const appRun = useAppRun()
  const { t } = useTranslation()
  const { data } = useEvoluQuery(paymentNumberSeriesQuery)
  const [storedSeries] = data
  const series = useMemo(
    () => storedSeries ?? createDefaultPaymentNumberSeries(),
    [storedSeries]
  )

  /**
   * `updatePaymentNumberSeries` upserts the whole row over the defaults, so
   * a partial save would reset every field it leaves out. Each control sends
   * the current series with its own field replaced.
   */
  const save = async (changed: Partial<PaymentNumberSeriesRow>) => {
    await using run = appRun()
    await run(
      updatePaymentNumberSeries({
        serialNumberDigits: series.serialNumberDigits,
        prefix: series.prefix,
        yearFormat: series.yearFormat,
        monthFormat: series.monthFormat,
        dayFormat: series.dayFormat,
        ...changed,
      })
    )
  }

  const toggleOptions = <Value extends string>(
    options: ReadonlyArray<ToggleOption<Value>>
  ): ReadonlyArray<OptionToggleGroupOption<Value>> =>
    options.map((option) => ({
      value: option.value,
      icon: ReceiptText,
      title: t(option.label),
      description: t(option.description),
    }))

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.paymentNumberSeries.form.title")}</CardTitle>
        <CardDescription>
          {t("settings.paymentNumberSeries.form.description")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <InlineEditField
            label={t("settings.paymentNumberSeries.serialNumberDigits.label")}
            description={t(
              "settings.paymentNumberSeries.serialNumberDigits.description"
            )}
            inputMode="numeric"
            defaultValue={series.serialNumberDigits}
            codec={positiveIntegerCodec}
            errorKey="settings.paymentNumberSeries.serialNumberDigits.invalid"
            onSave={(serialNumberDigits) => save({ serialNumberDigits })}
          />

          <InlineEditField
            label={t("settings.paymentNumberSeries.prefix.label")}
            description={t("settings.paymentNumberSeries.prefix.description")}
            defaultValue={series.prefix}
            codec={optionalTextCodec}
            errorKey="settings.paymentNumberSeries.prefix.invalid"
            onSave={(prefix) => save({ prefix })}
          />

          <InlineEditToggleGroup
            label={t("settings.paymentNumberSeries.year.label")}
            defaultValue={series.yearFormat}
            options={toggleOptions(yearFormatOptions)}
            onSave={(yearFormat) => save({ yearFormat })}
          />

          <InlineEditToggleGroup
            label={t("settings.paymentNumberSeries.month.label")}
            defaultValue={series.monthFormat}
            options={toggleOptions(monthFormatOptions)}
            onSave={(monthFormat) => save({ monthFormat })}
          />

          <InlineEditToggleGroup
            label={t("settings.paymentNumberSeries.day.label")}
            defaultValue={series.dayFormat}
            options={toggleOptions(dayFormatOptions)}
            onSave={(dayFormat) => save({ dayFormat })}
          />
        </FieldGroup>
      </CardContent>
    </Card>
  )
}
