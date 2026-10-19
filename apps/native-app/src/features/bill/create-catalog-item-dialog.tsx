import {
  type CatalogItemFormErrors,
  parseCatalogItemForm,
} from "@payky/app-shared/catalog-item-form-schema"
import type { TranslationKey } from "@payky/app-shared/i18n/resources"
import { NO_OPTION } from "@payky/app-shared/inline-edit-codecs"
import type { CatalogCategoryId } from "@payky/core/modules/catalog-category/catalog-category-types"
import type { CatalogItemRow } from "@payky/core/modules/catalog-item/catalog-item"
import { createCatalogItemAtEnd } from "@payky/core/modules/catalog-item/catalog-item-actions"
import { catalogItemByIdQuery } from "@payky/core/modules/catalog-item/catalog-item-queries"
import type { FiatCurrency } from "@payky/core/modules/shared/schema"
import type { TaxRateId } from "@payky/core/modules/tax-rate/tax-rate-types"
import { useAtomValue } from "jotai"
import { useState } from "react"
import { Modal, ScrollView } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { Text, useTheme, YStack } from "tamagui"
import { evoluAtom } from "../../atoms/evolu.ts"
import { Field } from "../../components/field.tsx"
import { OptionSelect } from "../../components/option-select.tsx"
import { Button } from "../../components/ui/button.tsx"
import { useRequirePermission } from "../../core/use-access.ts"
import type { useProductLookup } from "../../hooks/use-product-lookup.ts"
import { useRunToast } from "../../hooks/use-run-toast.ts"
import { useToast } from "../../hooks/use-toast.ts"
import { useTranslation } from "../../hooks/use-translation.ts"
import { useCatalogItemOptions } from "../shared/use-catalog-item-options.ts"

/**
 * Lightweight create-item form opened from bill scan mode when a scanned code
 * matches no catalog item, as web's `CreateCatalogItemDialog`: name,
 * description, price, category and tax rate; the rest is left for Settings.
 * Name and description are prefilled from `productLookup` once it arrives,
 * unless the user already typed into them.
 */
export function CreateCatalogItemDialog({
  scanCode,
  productLookup,
  currency,
  onClose,
  onCreated,
}: {
  /** `null` while closed. */
  readonly scanCode: string | null
  readonly productLookup: ReturnType<typeof useProductLookup>
  readonly currency: FiatCurrency
  readonly onClose: () => void
  readonly onCreated: (item: CatalogItemRow) => void
}) {
  return (
    <Modal
      visible={scanCode !== null}
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {scanCode === null ? null : (
        <CreateForm
          scanCode={scanCode}
          productLookup={productLookup}
          currency={currency}
          onClose={onClose}
          onCreated={onCreated}
        />
      )}
    </Modal>
  )
}

function CreateForm({
  scanCode,
  productLookup,
  currency,
  onClose,
  onCreated,
}: {
  readonly scanCode: string
  readonly productLookup: ReturnType<typeof useProductLookup>
  readonly currency: FiatCurrency
  readonly onClose: () => void
  readonly onCreated: (item: CatalogItemRow) => void
}) {
  const { t } = useTranslation()
  const theme = useTheme()
  const toast = useToast()
  const runToast = useRunToast()
  const { require } = useRequirePermission()
  const evolu = useAtomValue(evoluAtom)
  const { defaultTaxRate, categoryOptions, taxRateOptions } =
    useCatalogItemOptions()
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [price, setPrice] = useState("")
  const [categoryId, setCategoryId] = useState<CatalogCategoryId | "none">(
    NO_OPTION
  )
  const [taxRateId, setTaxRateId] = useState<TaxRateId | "none">(
    defaultTaxRate?.id ?? NO_OPTION
  )
  const [errors, setErrors] = useState<CatalogItemFormErrors>({})
  const [pending, setPending] = useState(false)

  // Prefill once the lookup arrives, without overwriting what was typed.
  const { product } = productLookup
  const [prefilledFrom, setPrefilledFrom] = useState(product)
  if (product !== prefilledFrom) {
    setPrefilledFrom(product)
    if (product !== undefined) {
      if (name === "") setName(product.name)
      if (description === "") setDescription(product.description ?? "")
    }
  }

  const error = (field: keyof CatalogItemFormErrors) => {
    const key: TranslationKey | undefined = errors[field]
    return key === undefined ? undefined : t(key)
  }
  const clear = (field: keyof CatalogItemFormErrors) =>
    setErrors((current) => ({ ...current, [field]: undefined }))

  const submit = async () => {
    setErrors({})
    const parsed = parseCatalogItemForm(
      {
        name,
        price,
        description,
        internalName: "",
        internalDescription: "",
        sku: "",
        scanCode,
      },
      currency
    )
    if (!parsed.ok) {
      setErrors(parsed.error)
      // The scanned code has no field here to show it under.
      if (parsed.error.scanCode !== undefined)
        toast.error(t(parsed.error.scanCode))
      return
    }
    const values = parsed.value
    // The same synced write as Settings → Items (access/0002).
    if (!(await require("settings", "access.action.createItem"))) return
    setPending(true)
    await runToast(async (run) => {
      const id = await run.ok(
        createCatalogItemAtEnd({
          deviceId: null,
          categoryId: categoryId === NO_OPTION ? null : categoryId,
          name: values.name,
          description: values.description,
          currency,
          unitAmount: values.price,
          scanCode: values.scanCode,
          taxRateId: taxRateId === NO_OPTION ? null : taxRateId,
        })
      )
      const [created] = await evolu.loadQuery(catalogItemByIdQuery(id))
      if (created === undefined) return "app.saveFailed"
      onCreated(created)
      return undefined
    })
    setPending(false)
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background.val }}>
      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 12 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text fontSize={24} fontWeight="600" accessibilityRole="header">
          {t("bill.scan.create.title")}
        </Text>
        <Text color="muted-foreground">
          {t("bill.scan.create.description", { code: scanCode })}
        </Text>
        <Field
          label={t("settings.items.form.name.label")}
          placeholder={t("settings.items.form.name.placeholder")}
          value={name}
          disabled={pending}
          autoCorrect={false}
          error={error("name")}
          onChangeText={(next) => {
            setName(next)
            clear("name")
          }}
        />
        <Field
          label={t("settings.items.form.description.label")}
          placeholder={t("settings.items.form.description.placeholder")}
          value={description}
          disabled={pending}
          autoCorrect={false}
          error={error("description")}
          onChangeText={(next) => {
            setDescription(next)
            clear("description")
          }}
        />
        {productLookup.isFetching ? (
          <Text fontSize={13} color="muted-foreground">
            {t("bill.scan.lookup.loading")}
          </Text>
        ) : product === undefined ? null : (
          <Text fontSize={13} color="muted-foreground">
            {t("bill.scan.lookup.source", { source: product.source })}
          </Text>
        )}
        <Field
          label={t("settings.items.form.price.label")}
          keyboardType="decimal-pad"
          value={price}
          disabled={pending}
          error={error("price")}
          onChangeText={(next) => {
            setPrice(next)
            clear("price")
          }}
        />
        <YStack gap="2">
          <Text fontWeight="700">
            {t("settings.items.form.category.label")}
          </Text>
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
        </YStack>
        <Button
          size="lg"
          label={t("bill.scan.create.save")}
          pending={pending}
          onPress={() => void submit()}
        />
        <Button
          size="lg"
          variant="outline"
          label={t("bill.scan.unknown.cancel")}
          disabled={pending}
          onPress={onClose}
        />
      </ScrollView>
    </SafeAreaView>
  )
}
