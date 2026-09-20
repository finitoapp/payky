import { sqliteTrue } from "@evolu/common"
import { PlusIcon, RotateCcwIcon, Trash2Icon } from "lucide-react"
import { useId, useState } from "react"
import { toast } from "sonner"

import { FadeHeader } from "@/components/fade-header.tsx"
import { Button } from "@/components/ui/button.tsx"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field.tsx"
import { Input } from "@/components/ui/input.tsx"
import { Switch } from "@/components/ui/switch.tsx"
import type { AppSettingsRow } from "@/core/modules/app-settings/app-settings.ts"
import { updateTipSettings } from "@/core/modules/app-settings/app-settings-actions.ts"
import { settingsQuery } from "@/core/modules/app-settings/app-settings-queries.ts"
import {
  defaultTipFixedAmounts,
  defaultTipPercentages,
  maxTipPresetCount,
  parseTipFixedAmounts,
  parseTipPercentages,
} from "@/core/modules/app-settings/app-settings-tips.ts"
import { decimalAmountToMinorUnits } from "@/core/modules/shared/money.ts"
import {
  Integer,
  PositiveIntegerFromStringSchema,
} from "@/core/modules/shared/schema.ts"
import { useAppRun } from "@/hooks/use-app-run.ts"
import { useEvoluQuery } from "@/hooks/use-evolu-query.ts"
import { useLocale } from "@/hooks/use-locale.ts"
import { useTranslation } from "@/hooks/use-translation.ts"
import { formatMoney } from "@/lib/format-utils.ts"

type TipPresetError =
  | "settings.tips.fixedAmounts.duplicate"
  | "settings.tips.fixedAmounts.invalid"
  | "settings.tips.fixedAmounts.maximum"
  | "settings.tips.percentages.duplicate"
  | "settings.tips.percentages.invalid"
  | "settings.tips.percentages.maximum"

interface TipSettingsValues {
  readonly enabled: boolean
  readonly percentages: ReadonlyArray<number>
  readonly fixedAmounts: ReadonlyArray<number>
}

interface TipsSettingsFormProps {
  readonly settings: Pick<
    AppSettingsRow,
    | "fiatCurrency"
    | "id"
    | "presetTipFixedAmountsJson"
    | "presetTipPercentagesJson"
    | "tipsEnabled"
  >
}

export function TipsSettingsPage() {
  const { t } = useTranslation()
  const { data } = useEvoluQuery(settingsQuery)
  const [settings] = data

  return (
    <>
      <div className="h-6" />
      <FadeHeader title={t("settings.tips.title")} />
      {settings === undefined ? null : (
        <TipsSettingsForm key={settings.id} settings={settings} />
      )}
    </>
  )
}

/**
 * Every change is written as it is made — a switch flip, a preset added or
 * removed, the reset — so there is nothing to remember to save. The list is
 * the form's own state and the write follows it; a failed write is reported
 * and the list keeps what the user set, so the next change retries it.
 */
function TipsSettingsForm({ settings }: TipsSettingsFormProps) {
  const appRun = useAppRun()
  const { t } = useTranslation()
  const locale = useLocale()
  const formId = useId()
  const [values, setValues] = useState<TipSettingsValues>(() => ({
    enabled: settings.tipsEnabled === sqliteTrue,
    percentages: parseTipPercentages(settings.presetTipPercentagesJson),
    fixedAmounts: parseTipFixedAmounts(settings.presetTipFixedAmountsJson),
  }))
  const [percentageInput, setPercentageInput] = useState("")
  const [fixedAmountInput, setFixedAmountInput] = useState("")
  const [percentageError, setPercentageError] = useState<TipPresetError | null>(
    null
  )
  const [fixedAmountError, setFixedAmountError] =
    useState<TipPresetError | null>(null)

  const persist = async (next: TipSettingsValues) => {
    setValues(next)
    try {
      await using run = appRun()
      await run(updateTipSettings(next))
    } catch {
      toast.error(t("settings.saveFailed"))
    }
  }

  const addPercentage = () => {
    const parsed = PositiveIntegerFromStringSchema.safeParse(
      percentageInput.trim()
    )
    if (!parsed.success || parsed.data > 100) {
      setPercentageError("settings.tips.percentages.invalid")
      return
    }
    if (values.percentages.includes(parsed.data)) {
      setPercentageError("settings.tips.percentages.duplicate")
      return
    }
    if (values.percentages.length === maxTipPresetCount) {
      setPercentageError("settings.tips.percentages.maximum")
      return
    }

    void persist({
      ...values,
      percentages: [...values.percentages, parsed.data],
    })
    setPercentageInput("")
    setPercentageError(null)
  }

  const addFixedAmount = () => {
    const amount = decimalAmountToMinorUnits({
      currency: settings.fiatCurrency,
      value: fixedAmountInput,
    })
    if (amount === null) {
      setFixedAmountError("settings.tips.fixedAmounts.invalid")
      return
    }
    if (values.fixedAmounts.includes(amount)) {
      setFixedAmountError("settings.tips.fixedAmounts.duplicate")
      return
    }
    if (values.fixedAmounts.length === maxTipPresetCount) {
      setFixedAmountError("settings.tips.fixedAmounts.maximum")
      return
    }

    void persist({
      ...values,
      fixedAmounts: [...values.fixedAmounts, amount],
    })
    setFixedAmountInput("")
    setFixedAmountError(null)
  }

  const resetToDefaults = () => {
    void persist({
      enabled: true,
      percentages: [...defaultTipPercentages],
      fixedAmounts: [...defaultTipFixedAmounts],
    })
    setPercentageInput("")
    setFixedAmountInput("")
    setPercentageError(null)
    setFixedAmountError(null)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.tips.form.title")}</CardTitle>
        <CardDescription>{t("settings.tips.form.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <Field orientation="horizontal">
            <FieldContent>
              <FieldLabel htmlFor={`${formId}-enabled`}>
                {t("settings.tips.enabled.label")}
              </FieldLabel>
              <FieldDescription>
                {t("settings.tips.enabled.description")}
              </FieldDescription>
            </FieldContent>
            <Switch
              id={`${formId}-enabled`}
              checked={values.enabled}
              onCheckedChange={(enabled) => {
                void persist({ ...values, enabled })
              }}
            />
          </Field>

          <TipPresetField
            addLabel={t("settings.tips.percentages.add")}
            description={t("settings.tips.percentages.description")}
            error={percentageError}
            inputId={`${formId}-percentage`}
            inputMode="numeric"
            inputValue={percentageInput}
            label={t("settings.tips.percentages.label")}
            onAdd={addPercentage}
            onInputChange={(value) => {
              setPercentageInput(value)
              setPercentageError(null)
            }}
            onRemove={(value) => {
              void persist({
                ...values,
                percentages: values.percentages.filter(
                  (percentage) => percentage !== value
                ),
              })
            }}
            placeholder={t("settings.tips.percentages.placeholder")}
            presets={values.percentages}
            renderPreset={(value) =>
              t("settings.tips.percentages.value", { value })
            }
          />

          <TipPresetField
            addLabel={t("settings.tips.fixedAmounts.add")}
            description={t("settings.tips.fixedAmounts.description", {
              currency: settings.fiatCurrency,
            })}
            error={fixedAmountError}
            inputId={`${formId}-fixedAmount`}
            inputMode="decimal"
            inputValue={fixedAmountInput}
            label={t("settings.tips.fixedAmounts.label")}
            onAdd={addFixedAmount}
            onInputChange={(value) => {
              setFixedAmountInput(value)
              setFixedAmountError(null)
            }}
            onRemove={(value) => {
              void persist({
                ...values,
                fixedAmounts: values.fixedAmounts.filter(
                  (amount) => amount !== value
                ),
              })
            }}
            placeholder={t("settings.tips.fixedAmounts.placeholder")}
            presets={values.fixedAmounts}
            renderPreset={(value) =>
              formatMoney(
                { value: Integer(value), currency: settings.fiatCurrency },
                locale
              )
            }
          />

          <Button type="button" variant="outline" onClick={resetToDefaults}>
            <RotateCcwIcon data-icon="inline-start" />
            {t("settings.tips.reset")}
          </Button>
        </FieldGroup>
      </CardContent>
    </Card>
  )
}

function TipPresetField({
  addLabel,
  description,
  error,
  inputId,
  inputMode,
  inputValue,
  label,
  onAdd,
  onInputChange,
  onRemove,
  placeholder,
  presets,
  renderPreset,
}: {
  readonly addLabel: string
  readonly description: string
  readonly error: TipPresetError | null
  readonly inputId: string
  readonly inputMode: "decimal" | "numeric"
  readonly inputValue: string
  readonly label: string
  readonly onAdd: () => void
  readonly onInputChange: (value: string) => void
  readonly onRemove: (value: number) => void
  readonly placeholder: string
  readonly presets: ReadonlyArray<number>
  readonly renderPreset: (value: number) => string
}) {
  const { t } = useTranslation()

  return (
    <Field data-invalid={error !== null}>
      <FieldLabel htmlFor={inputId}>{label}</FieldLabel>
      <FieldDescription>{description}</FieldDescription>
      <div className="flex flex-col divide-y rounded-lg border">
        {presets.map((value) => {
          const label = renderPreset(value)

          return (
            <div
              key={value}
              className="flex items-center justify-between gap-3 px-3 py-2"
            >
              <span className="text-sm font-medium">{label}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={t("settings.tips.preset.remove", { value: label })}
                onClick={() => {
                  onRemove(value)
                }}
              >
                <Trash2Icon />
              </Button>
            </div>
          )
        })}
      </div>
      <Input
        id={inputId}
        value={inputValue}
        aria-invalid={error !== null}
        autoComplete="off"
        inputMode={inputMode}
        placeholder={placeholder}
        onChange={(event) => {
          onInputChange(event.currentTarget.value)
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault()
            onAdd()
          }
        }}
      />
      <Button type="button" variant="outline" onClick={onAdd}>
        <PlusIcon data-icon="inline-start" />
        {addLabel}
      </Button>
      <FieldError>{error === null ? null : t(error)}</FieldError>
    </Field>
  )
}
