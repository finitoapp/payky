import {
  nonNegativeIntegerCodec,
  optionalDateCodec,
  optionalTextCodec,
  positiveIntegerCodec,
} from "@payky/app-shared/inline-edit-codecs"
import {
  dayFormatOptions,
  monthFormatOptions,
  type ToggleOption,
  yearFormatOptions,
} from "@payky/app-shared/payment-number-series-options"
import { updatePaymentLastNumber } from "@payky/core/modules/payment-number/payment-number-actions"
import { paymentLastNumberQuery } from "@payky/core/modules/payment-number/payment-number-queries"
import type { PaymentNumberSeriesRow } from "@payky/core/modules/payment-number-series/payment-number-series"
import { updatePaymentNumberSeries } from "@payky/core/modules/payment-number-series/payment-number-series-actions"
import { paymentNumberSeriesQuery } from "@payky/core/modules/payment-number-series/payment-number-series-queries"
import { createDefaultPaymentNumberSeries } from "@payky/core/modules/payment-number-series/payment-number-series-utils"
import { NonNegativeInteger } from "@payky/core/modules/shared/schema"
import { Text, YStack } from "tamagui"
import { FadeHeader } from "../../../components/fade-header.tsx"
import { InlineEditField } from "../../../components/inline-edit-field.tsx"
import { OptionSelect } from "../../../components/option-select.tsx"
import { Screen } from "../../../components/screen.tsx"
import { useEvoluQuery } from "../../../hooks/use-evolu-query.ts"
import { useInlineChoice } from "../../../hooks/use-inline-choice.ts"
import { useRunToast } from "../../../hooks/use-run-toast.ts"
import { useTranslation } from "../../../hooks/use-translation.ts"

/** Payment numbering, as web's `PaymentNumberSeriesSettingsPage`; each field is written at once. */
export function PaymentNumberSeriesSettingsPage() {
  const { t } = useTranslation()

  return (
    <Screen>
      <FadeHeader title={t("settings.paymentNumberSeries.title")} />
      <LastNumberSection />
      <SeriesFormatSection />
    </Screen>
  )
}

function LastNumberSection() {
  const runToast = useRunToast()
  const { t } = useTranslation()
  const [paymentLastNumber] = useEvoluQuery(paymentLastNumberQuery).data

  const serialNumber = paymentLastNumber?.serialNumber ?? NonNegativeInteger(0)
  const date = paymentLastNumber?.date ?? null

  // `updatePaymentLastNumber` writes the whole row, so each field carries the
  // other one along unchanged.
  const save = (values: {
    readonly serialNumber: typeof serialNumber
    readonly date: typeof date
  }) =>
    runToast(async (run) => {
      await run.ok(updatePaymentLastNumber(values))
    })

  return (
    <YStack gap="3">
      <Text fontWeight="700">
        {t("settings.paymentNumberSeries.lastNumber.title")}
      </Text>
      <Text color="muted-foreground">
        {t("settings.paymentNumberSeries.lastNumber.description")}
      </Text>
      <InlineEditField
        label={t("settings.paymentNumberSeries.lastNumber.serialNumber.label")}
        description={t(
          "settings.paymentNumberSeries.lastNumber.serialNumber.description"
        )}
        keyboardType="number-pad"
        defaultValue={serialNumber}
        codec={nonNegativeIntegerCodec}
        errorKey="settings.paymentNumberSeries.lastNumber.serialNumber.invalid"
        onSave={(next) => save({ serialNumber: next, date })}
      />
      <InlineEditField
        label={t("settings.paymentNumberSeries.lastNumber.date.label")}
        description={t(
          "settings.paymentNumberSeries.lastNumber.date.description"
        )}
        placeholder="yyyy-MM-dd"
        keyboardType="numbers-and-punctuation"
        defaultValue={date}
        codec={optionalDateCodec}
        errorKey="settings.paymentNumberSeries.lastNumber.date.invalid"
        onSave={(next) => save({ serialNumber, date: next })}
      />
    </YStack>
  )
}

function SeriesFormatSection() {
  const runToast = useRunToast()
  const { t } = useTranslation()
  const [storedSeries] = useEvoluQuery(paymentNumberSeriesQuery).data
  const series = storedSeries ?? createDefaultPaymentNumberSeries()

  /**
   * `updatePaymentNumberSeries` upserts the whole row over the defaults, so a
   * partial save would reset every field it leaves out. Each control sends
   * the current series with its own field replaced.
   */
  const save = (changed: Partial<PaymentNumberSeriesRow>) =>
    runToast(async (run) => {
      await run.ok(
        updatePaymentNumberSeries({
          serialNumberDigits: series.serialNumberDigits,
          prefix: series.prefix,
          yearFormat: series.yearFormat,
          monthFormat: series.monthFormat,
          dayFormat: series.dayFormat,
          ...changed,
        })
      )
    })

  const year = useInlineChoice(series.yearFormat, (yearFormat) =>
    save({ yearFormat })
  )
  const month = useInlineChoice(series.monthFormat, (monthFormat) =>
    save({ monthFormat })
  )
  const day = useInlineChoice(series.dayFormat, (dayFormat) =>
    save({ dayFormat })
  )

  const options = <Value extends string>(
    list: ReadonlyArray<ToggleOption<Value>>
  ) =>
    list.map((option) => ({
      value: option.value,
      title: t(option.label),
      description: t(option.description),
    }))

  return (
    <YStack gap="3">
      <Text fontWeight="700">
        {t("settings.paymentNumberSeries.form.title")}
      </Text>
      <Text color="muted-foreground">
        {t("settings.paymentNumberSeries.form.description")}
      </Text>
      <InlineEditField
        label={t("settings.paymentNumberSeries.serialNumberDigits.label")}
        description={t(
          "settings.paymentNumberSeries.serialNumberDigits.description"
        )}
        keyboardType="number-pad"
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
      <YStack gap="2">
        <Text fontWeight="600">
          {t("settings.paymentNumberSeries.year.label")}
        </Text>
        <OptionSelect
          value={year.value}
          options={options(yearFormatOptions)}
          onChange={(value) => void year.choose(value)}
        />
      </YStack>
      <YStack gap="2">
        <Text fontWeight="600">
          {t("settings.paymentNumberSeries.month.label")}
        </Text>
        <OptionSelect
          value={month.value}
          options={options(monthFormatOptions)}
          onChange={(value) => void month.choose(value)}
        />
      </YStack>
      <YStack gap="2">
        <Text fontWeight="600">
          {t("settings.paymentNumberSeries.day.label")}
        </Text>
        <OptionSelect
          value={day.value}
          options={options(dayFormatOptions)}
          onChange={(value) => void day.choose(value)}
        />
      </YStack>
    </YStack>
  )
}
