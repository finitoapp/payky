import { useRouter } from "@tanstack/react-router"
import { ScanLineIcon, Trash2Icon } from "lucide-react"
import { useId, useMemo, useState } from "react"
import { toast } from "sonner"
import { z } from "zod"

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
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field.tsx"
import { Input } from "@/components/ui/input.tsx"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx"
import { settingsQuery } from "@/core/modules/app-settings/app-settings-queries.ts"
import { catalogCategoriesQuery } from "@/core/modules/catalog-category/catalog-category-queries.ts"
import type { CatalogCategoryId } from "@/core/modules/catalog-category/catalog-category-types.ts"
import type { CatalogItemRow } from "@/core/modules/catalog-item/catalog-item.ts"
import {
  createCatalogItemAtEnd,
  deleteCatalogItem,
  updateCatalogItem,
} from "@/core/modules/catalog-item/catalog-item-actions.ts"
import {
  catalogItemByIdQuery,
  catalogItemsQuery,
} from "@/core/modules/catalog-item/catalog-item-queries.ts"
import {
  CatalogItemId,
  type CatalogItemId as CatalogItemIdType,
} from "@/core/modules/catalog-item/catalog-item-types.ts"
import {
  findCatalogItemsByScanCode,
  getStaffDisplayName,
} from "@/core/modules/catalog-item/catalog-item-utils.ts"
import {
  FiatCurrency,
  FiatCurrencySchema,
  type FiatCurrency as FiatCurrencyType,
} from "@/core/modules/shared/schema.ts"
import { taxRatesQuery } from "@/core/modules/tax-rate/tax-rate-queries.ts"
import type { TaxRateId } from "@/core/modules/tax-rate/tax-rate-types.ts"
import {
  filterSelectableTaxRates,
  taxRatePercentageToDecimalString,
} from "@/core/modules/tax-rate/tax-rate-utils.ts"
import { ScanCodeScannerDialog } from "@/features/scanner/scan-code-scanner-dialog.tsx"
import {
  NO_OPTION,
  optionalIdCodec,
  optionalTextCodec,
  requiredTextCodec,
} from "@/features/settings/inline-edit-codecs.ts"
import { InlineEditField } from "@/features/settings/inline-edit-field.tsx"
import { InlineEditSelect } from "@/features/settings/inline-edit-select.tsx"
import {
  type CatalogItemFormErrors,
  createPriceCodec,
  parseCatalogItemForm,
} from "@/features/settings/items/catalog-item-form-schema.ts"
import { SettingsFormCard } from "@/features/settings/settings-form-card.tsx"
import { SettingsFormEmptyState } from "@/features/settings/settings-form-empty-state.tsx"
import { useSettingsForm } from "@/features/settings/use-settings-form.ts"
import { fiatCurrencyOptions } from "@/features/shared/fiat-currency-options.ts"
import { useAppRun } from "@/hooks/use-app-run.ts"
import { useConfirmedRun } from "@/hooks/use-confirmed-run.ts"
import { useEvoluQuery } from "@/hooks/use-evolu-query.ts"
import { useTranslation } from "@/hooks/use-translation.ts"

const categoryCodec = optionalIdCodec<CatalogCategoryId>()
const taxRateCodec = optionalIdCodec<TaxRateId>()
const currencyCodec = FiatCurrencySchema

export function NewCatalogItemPage() {
  const { t } = useTranslation()
  const { data } = useEvoluQuery(settingsQuery)
  const [settings] = data

  return (
    <>
      <div className="h-6" />
      <FadeHeader title={t("settings.items.form.title.create")} />
      <CreateCatalogItemForm
        defaultCurrency={settings?.fiatCurrency ?? FiatCurrency.CZK}
      />
    </>
  )
}

export function EditCatalogItemPage({
  catalogItemId,
}: {
  readonly catalogItemId: string
}) {
  const parsedId = CatalogItemId.safeParse(catalogItemId)

  if (!parsedId.success) {
    return (
      <SettingsFormEmptyState
        titleKey="settings.items.form.title.edit"
        messageKey="settings.items.form.invalidId"
      />
    )
  }

  return <EditCatalogItemPageContent catalogItemId={parsedId.data} />
}

function EditCatalogItemPageContent({
  catalogItemId,
}: {
  readonly catalogItemId: CatalogItemIdType
}) {
  const { t } = useTranslation()
  const { data } = useEvoluQuery(catalogItemByIdQuery(catalogItemId))
  const [item] = data

  if (item === undefined) {
    return (
      <SettingsFormEmptyState
        titleKey="settings.items.form.title.edit"
        messageKey="settings.items.form.notFound"
      />
    )
  }

  return (
    <>
      <div className="h-6" />
      <FadeHeader title={t("settings.items.form.title.edit")} />
      <EditCatalogItemForm item={item} />
    </>
  )
}

/**
 * The category and tax-rate option lists, which both forms build the same
 * way: the "not set" entry, then the rows that are still selectable.
 */
const useCatalogItemOptions = (currentTaxRateId?: TaxRateId | null) => {
  const { t } = useTranslation()
  const { data: categories } = useEvoluQuery(catalogCategoriesQuery)
  const { data: taxRates } = useEvoluQuery(taxRatesQuery)

  const defaultTaxRate = taxRates.find(
    (rate) => rate.isDefault === 1 && rate.deactivatedAt === null
  )
  const selectableTaxRates = filterSelectableTaxRates(
    taxRates,
    currentTaxRateId
  )

  return {
    defaultTaxRate,
    categoryOptions: [
      { value: NO_OPTION, label: t("settings.items.form.category.none") },
      ...categories.map((category) => ({
        value: category.id,
        label: category.name,
      })),
    ],
    taxRateOptions: [
      { value: NO_OPTION, label: t("settings.items.form.taxRate.none") },
      ...selectableTaxRates.map((taxRate) => ({
        value: taxRate.id,
        label: `${taxRate.name} (${taxRatePercentageToDecimalString(taxRate.rate)}%)${
          taxRate.deactivatedAt !== null
            ? ` — ${t("settings.taxRates.archived.title")}`
            : ""
        }`,
      })),
    ],
  }
}

/**
 * The create form stays a submit-and-navigate form: there is no row to edit
 * in place yet, so it validates every field at once and only then inserts.
 */
function CreateCatalogItemForm({
  defaultCurrency,
}: {
  readonly defaultCurrency: FiatCurrencyType
}) {
  const appRun = useAppRun()
  const router = useRouter()
  const { t } = useTranslation()
  const formId = useId()
  const { data: catalogItems } = useEvoluQuery(catalogItemsQuery)
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
  const [currency, setCurrency] = useState<FiatCurrencyType>(defaultCurrency)
  const [price, setPrice] = useState("")
  const [scanCode, setScanCode] = useState("")
  const [scannerDialogOpen, setScannerDialogOpen] = useState(false)
  const [errors, setErrors] = useState<CatalogItemFormErrors>({})
  const { pending, saved, resetSaved, submit } = useSettingsForm()

  const clearError = (field: keyof CatalogItemFormErrors) => {
    setErrors((current) => ({ ...current, [field]: undefined }))
  }

  // Uniqueness can't be enforced (multiple devices can assign the same code
  // before syncing), so this is a heads-up shown next to the field, not a
  // blocking validation error.
  const scanCodeCollisions = useMemo(
    () => findCatalogItemsByScanCode(catalogItems, scanCode),
    [catalogItems, scanCode]
  )

  return (
    <>
      <SettingsFormCard
        title={t("settings.items.form.card.title")}
        description={t("settings.items.form.card.description")}
        savedMessage={saved ? t("settings.items.form.saved.create") : null}
        submitLabel={t("settings.items.form.save.create")}
        pending={pending}
        onSubmit={(event) => {
          event.preventDefault()
          setErrors({})
          resetSaved()

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

          void submit(async () => {
            try {
              await using run = appRun()
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
            } catch {
              toast.error(t("settings.saveFailed"))
              return false
            }
            router.history.back()
          })
        }}
      >
        <FieldGroup>
          <Field data-invalid={errors.name !== undefined}>
            <FieldLabel htmlFor={`${formId}-name`}>
              {t("settings.items.form.name.label")}
            </FieldLabel>
            <Input
              id={`${formId}-name`}
              value={name}
              disabled={pending}
              aria-invalid={errors.name !== undefined}
              autoComplete="off"
              placeholder={t("settings.items.form.name.placeholder")}
              onChange={(event) => {
                setName(event.currentTarget.value)
                clearError("name")
                resetSaved()
              }}
            />
            <FieldError>{errors.name ? t(errors.name) : null}</FieldError>
          </Field>

          <Field data-invalid={errors.internalName !== undefined}>
            <FieldLabel htmlFor={`${formId}-internalName`}>
              {t("settings.items.form.internalName.label")}
            </FieldLabel>
            <Input
              id={`${formId}-internalName`}
              value={internalName}
              disabled={pending}
              aria-invalid={errors.internalName !== undefined}
              autoComplete="off"
              placeholder={t("settings.items.form.internalName.placeholder")}
              onChange={(event) => {
                setInternalName(event.currentTarget.value)
                clearError("internalName")
                resetSaved()
              }}
            />
            <FieldDescription>
              {t("settings.items.form.internalName.hint")}
            </FieldDescription>
            <FieldError>
              {errors.internalName ? t(errors.internalName) : null}
            </FieldError>
          </Field>

          <Field data-invalid={errors.price !== undefined}>
            <FieldLabel htmlFor={`${formId}-price`}>
              {t("settings.items.form.price.label")}
            </FieldLabel>
            <div className="flex gap-2">
              <Input
                id={`${formId}-price`}
                value={price}
                disabled={pending}
                aria-invalid={errors.price !== undefined}
                autoComplete="off"
                inputMode="decimal"
                onChange={(event) => {
                  setPrice(event.currentTarget.value)
                  clearError("price")
                  resetSaved()
                }}
              />
              <Select<FiatCurrencyType>
                value={currency}
                onValueChange={(nextCurrency) => {
                  if (nextCurrency === null) return
                  setCurrency(nextCurrency)
                  resetSaved()
                }}
              >
                <SelectTrigger
                  id={`${formId}-currency`}
                  disabled={pending}
                  aria-label={t("settings.items.form.currency.label")}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {fiatCurrencyOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.value}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
            <FieldError>{errors.price ? t(errors.price) : null}</FieldError>
          </Field>

          <Field data-invalid={errors.description !== undefined}>
            <FieldLabel htmlFor={`${formId}-description`}>
              {t("settings.items.form.description.label")}
            </FieldLabel>
            <Input
              id={`${formId}-description`}
              value={description}
              disabled={pending}
              aria-invalid={errors.description !== undefined}
              autoComplete="off"
              placeholder={t("settings.items.form.description.placeholder")}
              onChange={(event) => {
                setDescription(event.currentTarget.value)
                clearError("description")
                resetSaved()
              }}
            />
            <FieldError>
              {errors.description ? t(errors.description) : null}
            </FieldError>
          </Field>

          <Field data-invalid={errors.internalDescription !== undefined}>
            <FieldLabel htmlFor={`${formId}-internalDescription`}>
              {t("settings.items.form.internalDescription.label")}
            </FieldLabel>
            <Input
              id={`${formId}-internalDescription`}
              value={internalDescription}
              disabled={pending}
              aria-invalid={errors.internalDescription !== undefined}
              autoComplete="off"
              placeholder={t(
                "settings.items.form.internalDescription.placeholder"
              )}
              onChange={(event) => {
                setInternalDescription(event.currentTarget.value)
                clearError("internalDescription")
                resetSaved()
              }}
            />
            <FieldError>
              {errors.internalDescription
                ? t(errors.internalDescription)
                : null}
            </FieldError>
          </Field>

          <Field data-invalid={errors.sku !== undefined}>
            <FieldLabel htmlFor={`${formId}-sku`}>
              {t("settings.items.form.sku.label")}
            </FieldLabel>
            <Input
              id={`${formId}-sku`}
              value={sku}
              disabled={pending}
              aria-invalid={errors.sku !== undefined}
              autoComplete="off"
              placeholder={t("settings.items.form.sku.placeholder")}
              onChange={(event) => {
                setSku(event.currentTarget.value)
                clearError("sku")
                resetSaved()
              }}
            />
            <FieldError>{errors.sku ? t(errors.sku) : null}</FieldError>
          </Field>

          <Field>
            <FieldLabel htmlFor={`${formId}-category`}>
              {t("settings.items.form.category.label")}
            </FieldLabel>
            <Select<CatalogCategoryId | "none">
              items={Object.fromEntries(
                categoryOptions.map((option) => [option.value, option.label])
              )}
              value={categoryId}
              onValueChange={(nextCategoryId) => {
                if (nextCategoryId === null) return
                setCategoryId(nextCategoryId)
                resetSaved()
              }}
            >
              <SelectTrigger id={`${formId}-category`} disabled={pending}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {categoryOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>

          <Field>
            <FieldLabel htmlFor={`${formId}-taxRate`}>
              {t("settings.items.form.taxRate.label")}
            </FieldLabel>
            <Select<TaxRateId | "none">
              items={Object.fromEntries(
                taxRateOptions.map((option) => [option.value, option.label])
              )}
              value={taxRateId}
              onValueChange={(nextTaxRateId) => {
                if (nextTaxRateId === null) return
                setTaxRateId(nextTaxRateId)
                resetSaved()
              }}
            >
              <SelectTrigger id={`${formId}-taxRate`} disabled={pending}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {taxRateOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <FieldDescription>
              {t("settings.items.form.taxRate.description")}
            </FieldDescription>
          </Field>

          <Field data-invalid={errors.scanCode !== undefined}>
            <FieldLabel htmlFor={`${formId}-scanCode`}>
              {t("settings.items.form.scanCode.label")}
            </FieldLabel>
            <div className="relative">
              <Input
                id={`${formId}-scanCode`}
                value={scanCode}
                disabled={pending}
                aria-invalid={errors.scanCode !== undefined}
                autoComplete="off"
                className="pr-12"
                placeholder={t("settings.items.form.scanCode.placeholder")}
                onChange={(event) => {
                  setScanCode(event.currentTarget.value)
                  clearError("scanCode")
                  resetSaved()
                }}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="absolute top-1/2 right-2 -translate-y-1/2 rounded-full"
                aria-label={t("settings.items.form.scanCode.scan.aria")}
                disabled={pending}
                onClick={() => setScannerDialogOpen(true)}
              >
                <ScanLineIcon />
              </Button>
            </div>
            {errors.scanCode === undefined && scanCodeCollisions.length > 0 && (
              <FieldDescription>
                {t("settings.items.form.scanCode.duplicate", {
                  name: scanCodeCollisions
                    .map((match) => getStaffDisplayName(match))
                    .join(", "),
                })}
              </FieldDescription>
            )}
            <FieldError>
              {errors.scanCode ? t(errors.scanCode) : null}
            </FieldError>
          </Field>
        </FieldGroup>
      </SettingsFormCard>

      <ScanCodeScannerDialog
        open={scannerDialogOpen}
        onOpenChange={setScannerDialogOpen}
        onScan={(rawValue) => {
          setScanCode(rawValue)
          clearError("scanCode")
          resetSaved()
        }}
      />
    </>
  )
}

/**
 * The edit form has no submit button: every field saves itself. The row
 * already exists, so each change is an independent update and there is
 * nothing to validate across fields.
 */
function EditCatalogItemForm({ item }: { readonly item: CatalogItemRow }) {
  const appRun = useAppRun()
  const confirmedRun = useConfirmedRun()
  const router = useRouter()
  const { t } = useTranslation()
  const { data: catalogItems } = useEvoluQuery(catalogItemsQuery)
  const { categoryOptions, taxRateOptions } = useCatalogItemOptions(
    item.taxRateId
  )
  const [scannerDialogOpen, setScannerDialogOpen] = useState(false)

  // How many minor units the price means depends on the currency next to it,
  // so the codec is rebuilt whenever that changes.
  const priceCodec = useMemo(
    () => createPriceCodec(item.currency),
    [item.currency]
  )

  // `updateCatalogItem` is a `Task<_, never>`: its only realistic failure is
  // unexpected infrastructure. Let it throw — the inline-edit controls turn
  // that into the toast and withhold their saved tick.
  const saveItem = async (
    values: Omit<Parameters<typeof updateCatalogItem>[0], "id">
  ) => {
    await using run = appRun()
    await run(updateCatalogItem({ id: item.id, ...values }))
  }

  // Uniqueness can't be enforced (multiple devices can assign the same code
  // before syncing), so this is a heads-up shown next to the field, not a
  // blocking validation error.
  const scanCodeCollisions = useMemo(
    () =>
      findCatalogItemsByScanCode(catalogItems, item.scanCode ?? "").filter(
        (match) => match.id !== item.id
      ),
    [catalogItems, item.scanCode, item.id]
  )

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader>
          <CardTitle>{t("settings.items.form.card.title")}</CardTitle>
          <CardDescription>
            {t("settings.items.form.card.description")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
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
              inputMode="decimal"
              defaultValue={item.unitAmount}
              codec={priceCodec}
              errorKey="settings.items.form.price.invalid"
              onSave={(unitAmount) => saveItem({ unitAmount })}
            />

            <InlineEditSelect
              label={t("settings.items.form.currency.label")}
              defaultValue={item.currency}
              codec={currencyCodec}
              options={fiatCurrencyOptions.map((option) => ({
                value: option.value,
                label: option.value,
              }))}
              onSave={(currency) => saveItem({ currency })}
            />

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
              placeholder={t(
                "settings.items.form.internalDescription.placeholder"
              )}
              defaultValue={item.internalDescription}
              codec={optionalTextCodec}
              errorKey="settings.items.form.internalDescription.invalid"
              onSave={(internalDescription) =>
                saveItem({ internalDescription })
              }
            />

            <InlineEditField
              label={t("settings.items.form.sku.label")}
              placeholder={t("settings.items.form.sku.placeholder")}
              defaultValue={item.sku}
              codec={optionalTextCodec}
              errorKey="settings.items.form.sku.invalid"
              onSave={(sku) => saveItem({ sku })}
            />

            <InlineEditSelect
              label={t("settings.items.form.category.label")}
              defaultValue={item.categoryId}
              codec={categoryCodec}
              options={categoryOptions}
              onSave={(categoryId) => saveItem({ categoryId })}
            />

            <InlineEditSelect
              label={t("settings.items.form.taxRate.label")}
              description={t("settings.items.form.taxRate.description")}
              defaultValue={item.taxRateId}
              codec={taxRateCodec}
              options={taxRateOptions}
              onSave={(taxRateId) => saveItem({ taxRateId })}
            />

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
              // Scanning bypasses the edit mode entirely: the scanner already
              // confirmed the value, so there is nothing left to confirm.
              trailing={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="rounded-full"
                  aria-label={t("settings.items.form.scanCode.scan.aria")}
                  onClick={() => setScannerDialogOpen(true)}
                >
                  <ScanLineIcon />
                </Button>
              }
              onSave={(scanCode) => saveItem({ scanCode })}
            />
          </FieldGroup>
        </CardContent>
      </Card>

      <ScanCodeScannerDialog
        open={scannerDialogOpen}
        onOpenChange={setScannerDialogOpen}
        onScan={(rawValue) => {
          const parsed = z.safeDecode(optionalTextCodec, rawValue)
          if (!parsed.success) return
          void saveItem({ scanCode: parsed.data })
        }}
      />

      <Button
        variant="destructive"
        onClick={() => {
          void (async () => {
            const deleted = await confirmedRun(
              {
                title: t("settings.items.delete.confirm.title", {
                  name: getStaffDisplayName(item),
                }),
                description: t("settings.items.delete.confirm.description", {
                  name: getStaffDisplayName(item),
                }),
                confirmLabel: t("settings.items.delete.confirm.confirm"),
                cancelLabel: t("settings.items.delete.confirm.cancel"),
                variant: "destructive",
              },
              deleteCatalogItem(item.id)
            )
            if (deleted) router.history.back()
          })()
        }}
      >
        <Trash2Icon data-icon="inline-start" />
        {t("settings.items.delete")}
      </Button>
    </div>
  )
}
