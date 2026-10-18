import { createPriceCodec } from "@payky/app-shared/catalog-item-form-schema"
import { fiatCurrencyOptions } from "@payky/app-shared/fiat-currency-options"
import {
  optionalIdCodec,
  optionalTextCodec,
  requiredTextCodec,
} from "@payky/app-shared/inline-edit-codecs"
import type { CatalogCategoryId } from "@payky/core/modules/catalog-category/catalog-category-types"
import type { CatalogItemRow } from "@payky/core/modules/catalog-item/catalog-item"
import {
  deleteCatalogItem,
  updateCatalogItem,
} from "@payky/core/modules/catalog-item/catalog-item-actions"
import {
  catalogItemByIdQuery,
  catalogItemsQuery,
} from "@payky/core/modules/catalog-item/catalog-item-queries"
import { CatalogItemId } from "@payky/core/modules/catalog-item/catalog-item-types"
import {
  findCatalogItemsByScanCode,
  getStaffDisplayName,
} from "@payky/core/modules/catalog-item/catalog-item-utils"
import type { TaxRateId } from "@payky/core/modules/tax-rate/tax-rate-types"
import { router, useLocalSearchParams } from "expo-router"
import { useMemo } from "react"
import { Text, YStack } from "tamagui"
import { z } from "zod"
import { AppButton } from "../../../components/app-button.tsx"
import { InlineEditField } from "../../../components/inline-edit-field.tsx"
import { OptionSelect } from "../../../components/option-select.tsx"
import { Screen } from "../../../components/screen.tsx"
import { ScreenHeader } from "../../../components/screen-header.tsx"
import { useConfirmedRun } from "../../../hooks/use-confirmed-run.ts"
import { useEvoluQuery } from "../../../hooks/use-evolu-query.ts"
import { useHardwareScanner } from "../../../hooks/use-hardware-scanner.ts"
import { useInlineChoice } from "../../../hooks/use-inline-choice.ts"
import { useIsConfirmOpen } from "../../../hooks/use-is-confirm-open.ts"
import { useRunToast } from "../../../hooks/use-run-toast.ts"
import { useTranslation } from "../../../hooks/use-translation.ts"
import { useCatalogItemOptions } from "../../shared/use-catalog-item-options.ts"
import { SettingsFormEmptyState } from "../settings-form-empty-state.tsx"
import { ScanCodeButton } from "./scan-code-button.tsx"

const categoryCodec = optionalIdCodec<CatalogCategoryId>()
const taxRateCodec = optionalIdCodec<TaxRateId>()

/** Edits one catalog item, as web's `EditCatalogItemPage`: every field saves itself. */
export function EditCatalogItemPage() {
  const { catalogItemId } = useLocalSearchParams<{ catalogItemId: string }>()
  const parsedId = CatalogItemId.safeParse(catalogItemId)

  if (!parsedId.success) {
    return (
      <SettingsFormEmptyState
        titleKey="settings.items.form.title.edit"
        messageKey="settings.items.form.invalidId"
      />
    )
  }
  return <EditCatalogItemLoader id={parsedId.data} />
}

function EditCatalogItemLoader({ id }: { readonly id: CatalogItemId }) {
  const [item] = useEvoluQuery(catalogItemByIdQuery(id)).data
  if (item === undefined) {
    return (
      <SettingsFormEmptyState
        titleKey="settings.items.form.title.edit"
        messageKey="settings.items.form.notFound"
      />
    )
  }
  return <EditCatalogItemForm item={item} />
}

function EditCatalogItemForm({ item }: { readonly item: CatalogItemRow }) {
  const { t } = useTranslation()
  const runToast = useRunToast()
  const confirmedRun = useConfirmedRun()
  const { data: catalogItems } = useEvoluQuery(catalogItemsQuery)
  const { categoryOptions, taxRateOptions } = useCatalogItemOptions(
    item.taxRateId
  )

  // How many minor units the price means depends on the currency next to it.
  const priceCodec = useMemo(
    () => createPriceCodec(item.currency),
    [item.currency]
  )

  // `updateCatalogItem` is a `Task<_, never>`: `run.ok` throws on an
  // unexpected failure and `useRunToast` turns that into the toast.
  const saveItem = (
    values: Omit<Parameters<typeof updateCatalogItem>[0], "id">
  ) =>
    runToast(async (run) => {
      await run.ok(updateCatalogItem({ id: item.id, ...values }))
    })

  const currency = useInlineChoice(item.currency, (next) =>
    saveItem({ currency: next })
  )
  const category = useInlineChoice(item.categoryId, (next) =>
    saveItem({ categoryId: next })
  )
  const taxRate = useInlineChoice(item.taxRateId, (next) =>
    saveItem({ taxRateId: next })
  )

  // Uniqueness can't be enforced (devices can assign the same code before
  // syncing), so this is a heads-up next to the field, not a validation error.
  const confirmOpen = useIsConfirmOpen()
  // A scan saves the code like the camera does: the value is already confirmed.
  useHardwareScanner({
    enabled: !confirmOpen,
    onScan: (code) => {
      const parsed = z.safeDecode(optionalTextCodec, code)
      if (parsed.success) void saveItem({ scanCode: parsed.data })
    },
  })
  const scanCodeCollisions = useMemo(
    () =>
      findCatalogItemsByScanCode(catalogItems, item.scanCode ?? "").filter(
        (match) => match.id !== item.id
      ),
    [catalogItems, item.scanCode, item.id]
  )

  return (
    <Screen>
      <ScreenHeader title={t("settings.items.form.title.edit")} />
      <Text color="muted-foreground">
        {t("settings.items.form.card.description")}
      </Text>
      <InlineEditField
        label={t("settings.items.form.name.label")}
        placeholder={t("settings.items.form.name.placeholder")}
        defaultValue={item.name}
        codec={requiredTextCodec}
        errorKey="settings.items.form.name.invalid"
        onSave={(name) => saveItem({ name })}
      />
      <InlineEditField
        label={t("settings.items.form.internalName.label")}
        description={t("settings.items.form.internalName.hint")}
        placeholder={t("settings.items.form.internalName.placeholder")}
        defaultValue={item.internalName}
        codec={optionalTextCodec}
        errorKey="settings.items.form.internalName.invalid"
        onSave={(internalName) => saveItem({ internalName })}
      />
      <InlineEditField
        label={t("settings.items.form.price.label")}
        keyboardType="decimal-pad"
        defaultValue={item.unitAmount}
        codec={priceCodec}
        errorKey="settings.items.form.price.invalid"
        onSave={(unitAmount) => saveItem({ unitAmount })}
      />
      <YStack gap="2">
        <Text fontWeight="700">{t("settings.items.form.currency.label")}</Text>
        <OptionSelect
          value={currency.value}
          options={fiatCurrencyOptions.map((option) => ({
            value: option.value,
            title: option.value,
          }))}
          onChange={(value) => void currency.choose(value)}
        />
      </YStack>
      <InlineEditField
        label={t("settings.items.form.description.label")}
        placeholder={t("settings.items.form.description.placeholder")}
        defaultValue={item.description}
        codec={optionalTextCodec}
        errorKey="settings.items.form.description.invalid"
        onSave={(description) => saveItem({ description })}
      />
      <InlineEditField
        label={t("settings.items.form.internalDescription.label")}
        placeholder={t("settings.items.form.internalDescription.placeholder")}
        defaultValue={item.internalDescription}
        codec={optionalTextCodec}
        errorKey="settings.items.form.internalDescription.invalid"
        onSave={(internalDescription) => saveItem({ internalDescription })}
      />
      <InlineEditField
        label={t("settings.items.form.sku.label")}
        placeholder={t("settings.items.form.sku.placeholder")}
        defaultValue={item.sku}
        codec={optionalTextCodec}
        errorKey="settings.items.form.sku.invalid"
        onSave={(sku) => saveItem({ sku })}
      />
      <YStack gap="2">
        <Text fontWeight="700">{t("settings.items.form.category.label")}</Text>
        <OptionSelect
          value={z.encode(categoryCodec, category.value)}
          options={categoryOptions}
          onChange={(value) =>
            void category.choose(
              z.safeDecode(categoryCodec, value).data ?? null
            )
          }
        />
      </YStack>
      <YStack gap="2">
        <Text fontWeight="700">{t("settings.items.form.taxRate.label")}</Text>
        <OptionSelect
          value={z.encode(taxRateCodec, taxRate.value)}
          options={taxRateOptions}
          onChange={(value) =>
            void taxRate.choose(z.safeDecode(taxRateCodec, value).data ?? null)
          }
        />
        <Text fontSize={13} color="muted-foreground">
          {t("settings.items.form.taxRate.description")}
        </Text>
      </YStack>
      <InlineEditField
        label={t("settings.items.form.scanCode.label")}
        description={
          scanCodeCollisions.length > 0
            ? t("settings.items.form.scanCode.duplicate", {
                name: scanCodeCollisions
                  .map((match) => getStaffDisplayName(match))
                  .join(", "),
              })
            : undefined
        }
        placeholder={t("settings.items.form.scanCode.placeholder")}
        defaultValue={item.scanCode}
        codec={optionalTextCodec}
        errorKey="settings.items.form.scanCode.invalid"
        onSave={(scanCode) => saveItem({ scanCode })}
      />
      {/* A scan skips the edit mode: the camera already confirmed the value. */}
      <ScanCodeButton
        onScan={(rawValue) => {
          const parsed = z.safeDecode(optionalTextCodec, rawValue)
          if (parsed.success) void saveItem({ scanCode: parsed.data })
        }}
      />
      <AppButton
        label={t("settings.items.delete")}
        variant="destructive"
        onPress={() => {
          void (async () => {
            const name = getStaffDisplayName(item)
            const deleted = await confirmedRun(
              {
                title: t("settings.items.delete.confirm.title", { name }),
                description: t("settings.items.delete.confirm.description", {
                  name,
                }),
                confirmLabel: t("settings.items.delete.confirm.confirm"),
                cancelLabel: t("settings.items.delete.confirm.cancel"),
                variant: "destructive",
              },
              deleteCatalogItem(item.id)
            )
            if (deleted) router.back()
          })()
        }}
      />
    </Screen>
  )
}
