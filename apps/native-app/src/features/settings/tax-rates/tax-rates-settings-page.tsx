import type { TranslationKey } from "@payky/app-shared/i18n/resources"
import { requiredTextCodec } from "@payky/app-shared/inline-edit-codecs"
import { parseTaxRateForm } from "@payky/app-shared/tax-rate-form"
import type { TaxRateRow } from "@payky/core/modules/tax-rate/tax-rate"
import {
  activateTaxRate,
  archiveTaxRate,
  createTaxRate,
  renameTaxRate,
  setDefaultTaxRate,
} from "@payky/core/modules/tax-rate/tax-rate-actions"
import { taxRatesQuery } from "@payky/core/modules/tax-rate/tax-rate-queries"
import { taxRatePercentageToDecimalString } from "@payky/core/modules/tax-rate/tax-rate-utils"
import { useState } from "react"
import { Pressable } from "react-native"
import { Text, XStack, YStack } from "tamagui"
import { AppButton } from "../../../components/app-button.tsx"
import { FadeHeader } from "../../../components/fade-header.tsx"
import { Field } from "../../../components/field.tsx"
import { InlineEditField } from "../../../components/inline-edit-field.tsx"
import { Screen } from "../../../components/screen.tsx"
import { useConfirm } from "../../../hooks/use-confirm.ts"
import { useEvoluQuery } from "../../../hooks/use-evolu-query.ts"
import { useRunToast } from "../../../hooks/use-run-toast.ts"
import { useTranslation } from "../../../hooks/use-translation.ts"

/** Tax rates, as web's `TaxRatesSettingsPage`; every change is written at once. */
export function TaxRatesSettingsPage() {
  const { t } = useTranslation()
  const { data: taxRates } = useEvoluQuery(taxRatesQuery)
  const activeTaxRates = taxRates.filter((rate) => rate.deactivatedAt === null)
  const archivedTaxRates = taxRates.filter(
    (rate) => rate.deactivatedAt !== null
  )

  return (
    <Screen>
      <FadeHeader title={t("settings.taxRates.title")} />
      <Text color="muted-foreground">{t("settings.taxRates.description")}</Text>
      {activeTaxRates.length === 0 ? (
        <Text color="muted-foreground" text="center">
          {t("settings.taxRates.empty")}
        </Text>
      ) : (
        <YStack gap="2">
          {activeTaxRates.map((taxRate) => (
            <TaxRateRowItem key={taxRate.id} taxRate={taxRate} />
          ))}
        </YStack>
      )}

      <NewTaxRateForm />

      {archivedTaxRates.length > 0 && (
        <YStack gap="2">
          <Text fontWeight="700">{t("settings.taxRates.archived.title")}</Text>
          {archivedTaxRates.map((taxRate) => (
            <TaxRateRowItem key={taxRate.id} taxRate={taxRate} />
          ))}
        </YStack>
      )}
    </Screen>
  )
}

function RowAction({
  glyph,
  label,
  disabled,
  onPress,
}: {
  readonly glyph: string
  /** Already translated. */
  readonly label: string
  readonly disabled: boolean
  readonly onPress: () => void
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={4}
      style={{
        minWidth: 44,
        minHeight: 44,
        alignItems: "center",
        justifyContent: "center",
      }}
      onPress={onPress}
    >
      <Text fontSize={20} opacity={disabled ? 0.4 : 1}>
        {glyph}
      </Text>
    </Pressable>
  )
}

function TaxRateRowItem({ taxRate }: { readonly taxRate: TaxRateRow }) {
  const confirm = useConfirm()
  const runToast = useRunToast()
  const { t } = useTranslation()
  const isArchived = taxRate.deactivatedAt !== null
  const isDefault = taxRate.isDefault === 1
  const [editing, setEditing] = useState(false)
  const [pending, setPending] = useState(false)
  const name = { name: taxRate.name }

  const act = async (
    action: Parameters<typeof runToast>[0],
    confirmation?: {
      readonly key: "archive" | "activate"
    }
  ) => {
    if (confirmation !== undefined) {
      const prefix = `settings.taxRates.${confirmation.key}.confirm` as const
      const confirmed = await confirm({
        title: t(`${prefix}.title`, name),
        description: t(`${prefix}.description`, name),
        confirmLabel: t(`${prefix}.confirm`),
        cancelLabel: t(`${prefix}.cancel`),
        ...(confirmation.key === "archive" ? { variant: "destructive" } : {}),
      })
      if (!confirmed) return
    }
    setPending(true)
    await runToast(action)
    setPending(false)
  }

  if (editing) {
    return (
      <InlineEditField
        startEditing
        label={t("settings.taxRates.rename.input", name)}
        defaultValue={taxRate.name}
        codec={requiredTextCodec}
        errorKey="settings.taxRates.name.invalid"
        onSave={(next) =>
          runToast(async (run) => {
            await run.ok(renameTaxRate({ id: taxRate.id, name: next }))
          })
        }
        onEditFinished={() => setEditing(false)}
      />
    )
  }

  return (
    <XStack
      items="center"
      gap="2"
      px="3"
      py="1"
      rounded="lg"
      borderWidth={1}
      borderColor="border-color"
    >
      <YStack flex={1}>
        <Text fontWeight="600" numberOfLines={1}>
          {taxRate.name}
        </Text>
        <Text fontSize={13} color="muted-foreground">
          {taxRatePercentageToDecimalString(taxRate.rate)}%
        </Text>
      </YStack>
      {!isArchived && (
        <RowAction
          glyph={isDefault ? "★" : "☆"}
          label={t(
            isDefault
              ? "settings.taxRates.default.unset"
              : "settings.taxRates.default.set",
            name
          )}
          disabled={pending}
          onPress={() => {
            void act(async (run) => {
              await run.ok(setDefaultTaxRate(isDefault ? null : taxRate.id))
            })
          }}
        />
      )}
      {!isArchived && (
        <RowAction
          glyph="✎"
          label={t("settings.taxRates.rename", name)}
          disabled={pending}
          onPress={() => setEditing(true)}
        />
      )}
      {isArchived ? (
        <RowAction
          glyph="↺"
          label={t("settings.taxRates.activate", name)}
          disabled={pending}
          onPress={() => {
            void act(
              async (run) => {
                await run.ok(activateTaxRate(taxRate.id))
              },
              { key: "activate" }
            )
          }}
        />
      ) : (
        <RowAction
          glyph="⌫"
          label={t("settings.taxRates.archive", name)}
          disabled={pending}
          onPress={() => {
            void act(
              async (run) => {
                await run.ok(archiveTaxRate(taxRate.id))
              },
              { key: "archive" }
            )
          }}
        />
      )}
    </XStack>
  )
}

function NewTaxRateForm() {
  const runToast = useRunToast()
  const { t } = useTranslation()
  const [name, setName] = useState("")
  const [rateInput, setRateInput] = useState("")
  const [nameError, setNameError] = useState<TranslationKey | null>(null)
  const [rateError, setRateError] = useState<TranslationKey | null>(null)
  const [pending, setPending] = useState(false)

  const submit = async () => {
    setNameError(null)
    setRateError(null)
    const form = parseTaxRateForm({ name, rate: rateInput })
    if (!form.ok) {
      if (form.field === "name") setNameError(form.errorKey)
      else setRateError(form.errorKey)
      return
    }
    setPending(true)
    const succeeded = await runToast(async (run) => {
      await run.ok(
        createTaxRate({ name: form.name, rate: form.rate, isDefault: false })
      )
    })
    setPending(false)
    if (succeeded) {
      setName("")
      setRateInput("")
    }
  }

  return (
    <YStack gap="3">
      <Text fontWeight="700">{t("settings.taxRates.add.title")}</Text>
      <Field
        label={t("settings.taxRates.name.label")}
        value={name}
        disabled={pending}
        autoCorrect={false}
        placeholder={t("settings.taxRates.name.placeholder")}
        error={nameError === null ? undefined : t(nameError)}
        onChangeText={(text) => {
          setName(text)
          setNameError(null)
        }}
      />
      <Field
        label={t("settings.taxRates.rate.label")}
        value={rateInput}
        disabled={pending}
        keyboardType="decimal-pad"
        placeholder="21"
        error={rateError === null ? undefined : t(rateError)}
        onChangeText={(text) => {
          setRateInput(text)
          setRateError(null)
        }}
      />
      <Text fontSize={13} color="muted-foreground">
        {t("settings.taxRates.rate.description")}
      </Text>
      <AppButton
        label={t("settings.taxRates.add")}
        pending={pending}
        onPress={() => {
          void submit()
        }}
      />
    </YStack>
  )
}
