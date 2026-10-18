import {
  type CatalogItemFormErrors,
  parseCatalogItemForm,
} from "@payky/app-shared/catalog-item-form-schema"
import { fiatCurrencyOptions } from "@payky/app-shared/fiat-currency-options"
import type { TranslationKey } from "@payky/app-shared/i18n/resources"
import { NO_OPTION } from "@payky/app-shared/inline-edit-codecs"
import { settingsQuery } from "@payky/core/modules/app-settings/app-settings-queries"
import { getFiatCurrency } from "@payky/core/modules/app-settings/app-settings-utils"
import type { CatalogCategoryId } from "@payky/core/modules/catalog-category/catalog-category-types"
import { createCatalogItemAtEnd } from "@payky/core/modules/catalog-item/catalog-item-actions"
import { catalogItemsQuery } from "@payky/core/modules/catalog-item/catalog-item-queries"
import {
  findCatalogItemsByScanCode,
  getStaffDisplayName,
} from "@payky/core/modules/catalog-item/catalog-item-utils"
import type { FiatCurrency } from "@payky/core/modules/shared/schema"
import type { TaxRateId } from "@payky/core/modules/tax-rate/tax-rate-types"
import { router } from "expo-router"
import { type ComponentProps, useMemo, useState } from "react"
import { Text, YStack } from "tamagui"
import { AppButton } from "../../../components/app-button.tsx"
import { Field } from "../../../components/field.tsx"
import { OptionSelect } from "../../../components/option-select.tsx"
import { Screen } from "../../../components/screen.tsx"
import { ScreenHeader } from "../../../components/screen-header.tsx"
import { useEvoluQuery } from "../../../hooks/use-evolu-query.ts"
import { useRunToast } from "../../../hooks/use-run-toast.ts"
import { useTranslation } from "../../../hooks/use-translation.ts"
import { useCatalogItemOptions } from "../../shared/use-catalog-item-options.ts"
import { ScanCodeButton } from "./scan-code-button.tsx"

/**
 * Adds a catalog item, as web's `NewCatalogItemPage`: a submit-and-go-back
 * form that validates every field at once before it inserts.
 */
export function NewCatalogItemPage() {
  const { t } = useTranslation()
  const [settings] = useEvoluQuery(settingsQuery).data
  const { data: catalogItems } = useEvoluQuery(catalogItemsQuery)
  const runToast = useRunToast()
  const { defaultTaxRate, categoryOptions, taxRateOptions } =
    useCatalogItemOptions()
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [internalName, setInternalName] = useState("")
  const [internalDescription, setInternalDescription] = useState("")
  const [sku, setSku] = useState("")
  const [categoryId, setCategoryId] = useState<CatalogCategoryId | "none">(
    NO_OPTION
  )
  const [taxRateId, setTaxRateId] = useState<TaxRateId | "none">(
    defaultTaxRate?.id ?? NO_OPTION
  )
  const [currency, setCurrency] = useState<FiatCurrency>(
    getFiatCurrency(settings)
  )
  const [price, setPrice] = useState("")
  const [scanCode, setScanCode] = useState("")
  const [errors, setErrors] = useState<CatalogItemFormErrors>({})
  const [pending, setPending] = useState(false)

  const clearError = (field: keyof CatalogItemFormErrors) =>
    setErrors((current) => ({ ...current, [field]: undefined }))
  const error = (field: keyof CatalogItemFormErrors) => {
    const key: TranslationKey | undefined = errors[field]
    return key === undefined ? undefined : t(key)
  }
  const text = (
    field: keyof CatalogItemFormErrors,
    value: string,
    set: (value: string) => void
  ): Pick<
    ComponentProps<typeof Field>,
    "value" | "onChangeText" | "error" | "disabled" | "autoCorrect"
  > => ({
    value,
    disabled: pending,
    autoCorrect: false,
    error: error(field),
    onChangeText: (next) => {
      set(next)
      clearError(field)
    },
  })

  // Uniqueness can't be enforced (devices can assign the same code before
  // syncing), so this is a heads-up next to the field, not a validation error.
  const scanCodeCollisions = useMemo(
    () => findCatalogItemsByScanCode(catalogItems, scanCode),
    [catalogItems, scanCode]
  )

  const submit = async () => {
    setErrors({})
    const parsed = parseCatalogItemForm(
      {
        name,
        price,
        description,
        internalName,
        internalDescription,
        sku,
        scanCode,
      },
      currency
    )
    if (!parsed.ok) {
      setErrors(parsed.error)
      return
    }
    const values = parsed.value
    setPending(true)
    const saved = await runToast(async (run) => {
      await run.ok(
        createCatalogItemAtEnd({
          deviceId: null,
          categoryId: categoryId === NO_OPTION ? null : categoryId,
          name: values.name,
          description: values.description,
          internalName: values.internalName,
          internalDescription: values.internalDescription,
          sku: values.sku,
          currency,
          unitAmount: values.price,
          scanCode: values.scanCode,
          taxRateId: taxRateId === NO_OPTION ? null : taxRateId,
        })
      )
    })
    setPending(false)
    if (saved) router.back()
  }

  return (
    <Screen>
      <ScreenHeader title={t("settings.items.form.title.create")} />
      <Text color="muted-foreground">
        {t("settings.items.form.card.description")}
      </Text>
      <Field
        label={t("settings.items.form.name.label")}
        placeholder={t("settings.items.form.name.placeholder")}
        {...text("name", name, setName)}
      />
      <Field
        label={t("settings.items.form.internalName.label")}
        placeholder={t("settings.items.form.internalName.placeholder")}
        {...text("internalName", internalName, setInternalName)}
      />
      <Text fontSize={13} color="muted-foreground">
        {t("settings.items.form.internalName.hint")}
      </Text>
      <Field
        label={t("settings.items.form.price.label")}
        keyboardType="decimal-pad"
        {...text("price", price, setPrice)}
      />
      <YStack gap="2">
        <Text fontWeight="700">{t("settings.items.form.currency.label")}</Text>
        <OptionSelect
          value={currency}
          options={fiatCurrencyOptions.map((option) => ({
            value: option.value,
            title: option.value,
          }))}
          onChange={setCurrency}
        />
      </YStack>
      <Field
        label={t("settings.items.form.description.label")}
        placeholder={t("settings.items.form.description.placeholder")}
        {...text("description", description, setDescription)}
      />
      <Field
        label={t("settings.items.form.internalDescription.label")}
        placeholder={t("settings.items.form.internalDescription.placeholder")}
        {...text(
          "internalDescription",
          internalDescription,
          setInternalDescription
        )}
      />
      <Field
        label={t("settings.items.form.sku.label")}
        placeholder={t("settings.items.form.sku.placeholder")}
        {...text("sku", sku, setSku)}
      />
      <YStack gap="2">
        <Text fontWeight="700">{t("settings.items.form.category.label")}</Text>
        <OptionSelect
          value={categoryId}
          options={categoryOptions}
          onChange={setCategoryId}
        />
      </YStack>
      <YStack gap="2">
        <Text fontWeight="700">{t("settings.items.form.taxRate.label")}</Text>
        <OptionSelect
          value={taxRateId}
          options={taxRateOptions}
          onChange={setTaxRateId}
        />
        <Text fontSize={13} color="muted-foreground">
          {t("settings.items.form.taxRate.description")}
        </Text>
      </YStack>
      <Field
        label={t("settings.items.form.scanCode.label")}
        placeholder={t("settings.items.form.scanCode.placeholder")}
        {...text("scanCode", scanCode, setScanCode)}
      />
      {errors.scanCode === undefined && scanCodeCollisions.length > 0 && (
        <Text fontSize={13} color="muted-foreground">
          {t("settings.items.form.scanCode.duplicate", {
            name: scanCodeCollisions
              .map((match) => getStaffDisplayName(match))
              .join(", "),
          })}
        </Text>
      )}
      <ScanCodeButton
        disabled={pending}
        onScan={(code) => {
          setScanCode(code)
          clearError("scanCode")
        }}
      />
      <AppButton
        label={t("settings.items.form.save.create")}
        pending={pending}
        onPress={() => {
          void submit()
        }}
      />
    </Screen>
  )
}
