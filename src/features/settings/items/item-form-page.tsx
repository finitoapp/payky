import { useRouter } from "@tanstack/react-router"
import { ScanLineIcon, Trash2Icon } from "lucide-react"
import { useId, useMemo, useState } from "react"
import { toast } from "sonner"

import { FadeHeader } from "@/components/fade-header.tsx"
import { ScanCodeScannerDialog } from "@/components/scan-code-scanner-dialog.tsx"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog.tsx"
import { Button } from "@/components/ui/button.tsx"
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
  decimalAmountToMinorUnits,
  minorUnitsToDecimalString,
} from "@/core/modules/shared/money.ts"
import {
  FiatCurrency,
  type FiatCurrency as FiatCurrencyType,
  Integer,
  NonEmptyString255Schema,
  NonNegativeInteger,
} from "@/core/modules/shared/schema.ts"
import { fiatCurrencyOptions } from "@/features/settings/fiat-currency-options.ts"
import { SettingsFormCard } from "@/features/settings/settings-form-card.tsx"
import { useSettingsForm } from "@/features/settings/use-settings-form.ts"
import { useAppRun } from "@/hooks/use-app-run.ts"
import { useEvoluQuery } from "@/hooks/use-evolu-query.ts"
import { useTranslation } from "@/hooks/use-translation.ts"
import type { TranslationKey } from "@/i18n/resources.ts"

export function NewCatalogItemPage() {
  const { t } = useTranslation()
  const { data } = useEvoluQuery(settingsQuery)
  const [settings] = data

  return (
    <>
      <div className="h-6" />
      <FadeHeader title={t("settings.items.form.title.create")} />
      <CatalogItemForm
        mode="create"
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
      <CatalogItemFormEmptyState messageKey="settings.items.form.invalidId" />
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
      <CatalogItemFormEmptyState messageKey="settings.items.form.notFound" />
    )
  }

  return (
    <>
      <div className="h-6" />
      <FadeHeader title={t("settings.items.form.title.edit")} />
      <CatalogItemForm mode="edit" item={item} />
    </>
  )
}

function CatalogItemFormEmptyState({
  messageKey,
}: {
  readonly messageKey:
    | "settings.items.form.invalidId"
    | "settings.items.form.notFound"
}) {
  const { t } = useTranslation()

  return (
    <>
      <div className="h-6" />
      <FadeHeader title={t("settings.items.form.title.edit")} />
      <p className="mt-16 px-6 text-center text-muted-foreground">
        {t(messageKey)}
      </p>
    </>
  )
}

function CatalogItemForm({
  mode,
  item,
  defaultCurrency,
}: {
  readonly mode: "create" | "edit"
  readonly item?: CatalogItemRow
  readonly defaultCurrency?: FiatCurrencyType
}) {
  const appRun = useAppRun()
  const router = useRouter()
  const { t } = useTranslation()
  const nameInputId = useId()
  const descriptionInputId = useId()
  const internalNameInputId = useId()
  const internalDescriptionInputId = useId()
  const skuInputId = useId()
  const priceInputId = useId()
  const currencyInputId = useId()
  const categoryInputId = useId()
  const scanCodeInputId = useId()
  const { data: categories } = useEvoluQuery(catalogCategoriesQuery)
  const { data: catalogItems } = useEvoluQuery(catalogItemsQuery)
  const [name, setName] = useState(item?.name ?? "")
  const [description, setDescription] = useState(item?.description ?? "")
  const [internalName, setInternalName] = useState(item?.internalName ?? "")
  const [internalDescription, setInternalDescription] = useState(
    item?.internalDescription ?? ""
  )
  const [sku, setSku] = useState(item?.sku ?? "")
  const [categoryId, setCategoryId] = useState<CatalogCategoryId | "none">(
    item?.categoryId ?? "none"
  )
  const [currency, setCurrency] = useState<FiatCurrencyType>(
    item?.currency ?? defaultCurrency ?? FiatCurrency.CZK
  )
  const [price, setPrice] = useState(() =>
    item === undefined
      ? ""
      : minorUnitsToDecimalString({
          value: Integer(item.unitAmount),
          currency: item.currency,
        })
  )
  const [scanCode, setScanCode] = useState(item?.scanCode ?? "")
  const [scannerDialogOpen, setScannerDialogOpen] = useState(false)
  const [nameError, setNameError] = useState<TranslationKey | null>(null)
  const [priceError, setPriceError] = useState<TranslationKey | null>(null)
  const [descriptionError, setDescriptionError] =
    useState<TranslationKey | null>(null)
  const [internalNameError, setInternalNameError] =
    useState<TranslationKey | null>(null)
  const [internalDescriptionError, setInternalDescriptionError] =
    useState<TranslationKey | null>(null)
  const [skuError, setSkuError] = useState<TranslationKey | null>(null)
  const [scanCodeError, setScanCodeError] = useState<TranslationKey | null>(
    null
  )
  const { pending, saved, resetSaved, submit } = useSettingsForm()

  // Uniqueness can't be enforced (multiple devices can assign the same code
  // before syncing), so this is a heads-up shown next to the field, not a
  // blocking validation error.
  const scanCodeCollisions = useMemo(
    () =>
      findCatalogItemsByScanCode(catalogItems, scanCode).filter(
        (match) => match.id !== item?.id
      ),
    [catalogItems, scanCode, item?.id]
  )

  return (
    <div className="flex flex-col gap-5">
      <SettingsFormCard
        title={t("settings.items.form.card.title")}
        description={t("settings.items.form.card.description")}
        savedMessage={
          saved
            ? t(
                mode === "create"
                  ? "settings.items.form.saved.create"
                  : "settings.items.form.saved.edit"
              )
            : null
        }
        submitLabel={t(
          mode === "create"
            ? "settings.items.form.save.create"
            : "settings.items.form.save.edit"
        )}
        pending={pending}
        onSubmit={(event) => {
          event.preventDefault()
          setNameError(null)
          setPriceError(null)
          setDescriptionError(null)
          setInternalNameError(null)
          setInternalDescriptionError(null)
          setSkuError(null)
          setScanCodeError(null)
          resetSaved()

          const trimmedName = name.trim()
          const nameResult = NonEmptyString255Schema.safeParse(trimmedName)
          if (!nameResult.success) {
            setNameError("settings.items.form.name.invalid")
            return
          }

          const priceAmount = decimalAmountToMinorUnits({
            currency,
            value: price,
          })
          if (priceAmount === null) {
            setPriceError("settings.items.form.price.invalid")
            return
          }
          const unitAmount = NonNegativeInteger(priceAmount)

          const trimmedDescription = description.trim()
          const descriptionResult = trimmedDescription
            ? NonEmptyString255Schema.safeParse(trimmedDescription)
            : null
          if (descriptionResult?.success === false) {
            setDescriptionError("settings.items.form.description.invalid")
            return
          }

          const trimmedInternalName = internalName.trim()
          const internalNameResult = trimmedInternalName
            ? NonEmptyString255Schema.safeParse(trimmedInternalName)
            : null
          if (internalNameResult?.success === false) {
            setInternalNameError("settings.items.form.internalName.invalid")
            return
          }

          const trimmedInternalDescription = internalDescription.trim()
          const internalDescriptionResult = trimmedInternalDescription
            ? NonEmptyString255Schema.safeParse(trimmedInternalDescription)
            : null
          if (internalDescriptionResult?.success === false) {
            setInternalDescriptionError(
              "settings.items.form.internalDescription.invalid"
            )
            return
          }

          const trimmedSku = sku.trim()
          const skuResult = trimmedSku
            ? NonEmptyString255Schema.safeParse(trimmedSku)
            : null
          if (skuResult?.success === false) {
            setSkuError("settings.items.form.sku.invalid")
            return
          }

          const trimmedScanCode = scanCode.trim()
          const scanCodeResult = trimmedScanCode
            ? NonEmptyString255Schema.safeParse(trimmedScanCode)
            : null
          if (scanCodeResult?.success === false) {
            setScanCodeError("settings.items.form.scanCode.invalid")
            return
          }

          void submit(async () => {
            await using run = appRun()

            if (mode === "create") {
              await run(
                createCatalogItemAtEnd({
                  deviceId: null,
                  categoryId: categoryId === "none" ? null : categoryId,
                  name: nameResult.data,
                  description: descriptionResult?.data ?? null,
                  internalName: internalNameResult?.data ?? null,
                  internalDescription: internalDescriptionResult?.data ?? null,
                  sku: skuResult?.data ?? null,
                  currency,
                  unitAmount,
                  scanCode: scanCodeResult?.data ?? null,
                })
              )
              router.history.back()
              return
            }

            if (item === undefined) return

            await run(
              updateCatalogItem({
                id: item.id,
                categoryId: categoryId === "none" ? null : categoryId,
                name: nameResult.data,
                description: descriptionResult?.data ?? null,
                internalName: internalNameResult?.data ?? null,
                internalDescription: internalDescriptionResult?.data ?? null,
                sku: skuResult?.data ?? null,
                currency,
                unitAmount,
                scanCode: scanCodeResult?.data ?? null,
              })
            )
          })
        }}
      >
        <FieldGroup>
          <Field data-invalid={nameError !== null}>
            <FieldLabel htmlFor={nameInputId}>
              {t("settings.items.form.name.label")}
            </FieldLabel>
            <Input
              id={nameInputId}
              value={name}
              disabled={pending}
              aria-invalid={nameError !== null}
              autoComplete="off"
              placeholder={t("settings.items.form.name.placeholder")}
              onChange={(event) => {
                setName(event.currentTarget.value)
                setNameError(null)
                resetSaved()
              }}
            />
            <FieldError>{nameError ? t(nameError) : null}</FieldError>
          </Field>

          <Field data-invalid={internalNameError !== null}>
            <FieldLabel htmlFor={internalNameInputId}>
              {t("settings.items.form.internalName.label")}
            </FieldLabel>
            <Input
              id={internalNameInputId}
              value={internalName}
              disabled={pending}
              aria-invalid={internalNameError !== null}
              autoComplete="off"
              placeholder={t("settings.items.form.internalName.placeholder")}
              onChange={(event) => {
                setInternalName(event.currentTarget.value)
                setInternalNameError(null)
                resetSaved()
              }}
            />
            <FieldDescription>
              {t("settings.items.form.internalName.hint")}
            </FieldDescription>
            <FieldError>
              {internalNameError ? t(internalNameError) : null}
            </FieldError>
          </Field>

          <Field data-invalid={priceError !== null}>
            <FieldLabel htmlFor={priceInputId}>
              {t("settings.items.form.price.label")}
            </FieldLabel>
            <div className="flex gap-2">
              <Input
                id={priceInputId}
                value={price}
                disabled={pending}
                aria-invalid={priceError !== null}
                autoComplete="off"
                inputMode="decimal"
                onChange={(event) => {
                  setPrice(event.currentTarget.value)
                  setPriceError(null)
                  resetSaved()
                }}
              />
              <Select<FiatCurrencyType>
                value={currency}
                onValueChange={(nextCurrency) => {
                  if (
                    nextCurrency === FiatCurrency.EUR ||
                    nextCurrency === FiatCurrency.USD ||
                    nextCurrency === FiatCurrency.CZK
                  ) {
                    setCurrency(nextCurrency)
                    resetSaved()
                  }
                }}
              >
                <SelectTrigger
                  id={currencyInputId}
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
            <FieldError>{priceError ? t(priceError) : null}</FieldError>
          </Field>

          <Field data-invalid={descriptionError !== null}>
            <FieldLabel htmlFor={descriptionInputId}>
              {t("settings.items.form.description.label")}
            </FieldLabel>
            <Input
              id={descriptionInputId}
              value={description}
              disabled={pending}
              aria-invalid={descriptionError !== null}
              autoComplete="off"
              placeholder={t("settings.items.form.description.placeholder")}
              onChange={(event) => {
                setDescription(event.currentTarget.value)
                setDescriptionError(null)
                resetSaved()
              }}
            />
            <FieldError>
              {descriptionError ? t(descriptionError) : null}
            </FieldError>
          </Field>

          <Field data-invalid={internalDescriptionError !== null}>
            <FieldLabel htmlFor={internalDescriptionInputId}>
              {t("settings.items.form.internalDescription.label")}
            </FieldLabel>
            <Input
              id={internalDescriptionInputId}
              value={internalDescription}
              disabled={pending}
              aria-invalid={internalDescriptionError !== null}
              autoComplete="off"
              placeholder={t(
                "settings.items.form.internalDescription.placeholder"
              )}
              onChange={(event) => {
                setInternalDescription(event.currentTarget.value)
                setInternalDescriptionError(null)
                resetSaved()
              }}
            />
            <FieldError>
              {internalDescriptionError ? t(internalDescriptionError) : null}
            </FieldError>
          </Field>

          <Field data-invalid={skuError !== null}>
            <FieldLabel htmlFor={skuInputId}>
              {t("settings.items.form.sku.label")}
            </FieldLabel>
            <Input
              id={skuInputId}
              value={sku}
              disabled={pending}
              aria-invalid={skuError !== null}
              autoComplete="off"
              placeholder={t("settings.items.form.sku.placeholder")}
              onChange={(event) => {
                setSku(event.currentTarget.value)
                setSkuError(null)
                resetSaved()
              }}
            />
            <FieldError>{skuError ? t(skuError) : null}</FieldError>
          </Field>

          <Field>
            <FieldLabel htmlFor={categoryInputId}>
              {t("settings.items.form.category.label")}
            </FieldLabel>
            <Select<CatalogCategoryId | "none">
              items={{
                none: t("settings.items.form.category.none"),
                ...Object.fromEntries(
                  categories.map((category) => [category.id, category.name])
                ),
              }}
              value={categoryId}
              onValueChange={(nextCategoryId) => {
                if (nextCategoryId === null) return
                setCategoryId(nextCategoryId)
                resetSaved()
              }}
            >
              <SelectTrigger id={categoryInputId} disabled={pending}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="none">
                    {t("settings.items.form.category.none")}
                  </SelectItem>
                  {categories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>

          <Field data-invalid={scanCodeError !== null}>
            <FieldLabel htmlFor={scanCodeInputId}>
              {t("settings.items.form.scanCode.label")}
            </FieldLabel>
            <div className="relative">
              <Input
                id={scanCodeInputId}
                value={scanCode}
                disabled={pending}
                aria-invalid={scanCodeError !== null}
                autoComplete="off"
                className="pr-12"
                placeholder={t("settings.items.form.scanCode.placeholder")}
                onChange={(event) => {
                  setScanCode(event.currentTarget.value)
                  setScanCodeError(null)
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
            {scanCodeError === null && scanCodeCollisions.length > 0 && (
              <FieldDescription>
                {t("settings.items.form.scanCode.duplicate", {
                  name: scanCodeCollisions
                    .map((match) => getStaffDisplayName(match))
                    .join(", "),
                })}
              </FieldDescription>
            )}
            <FieldError>{scanCodeError ? t(scanCodeError) : null}</FieldError>
          </Field>
        </FieldGroup>
      </SettingsFormCard>

      <ScanCodeScannerDialog
        open={scannerDialogOpen}
        onOpenChange={setScannerDialogOpen}
        onScan={(rawValue) => {
          setScanCode(rawValue)
          setScanCodeError(null)
          resetSaved()
        }}
      />

      {mode === "edit" && item !== undefined && (
        <AlertDialog>
          <AlertDialogTrigger
            render={
              <Button variant="destructive">
                <Trash2Icon data-icon="inline-start" />
                {t("settings.items.delete")}
              </Button>
            }
          />
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {t("settings.items.delete.confirm.title", {
                  name: getStaffDisplayName(item),
                })}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {t("settings.items.delete.confirm.description", {
                  name: getStaffDisplayName(item),
                })}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>
                {t("settings.items.delete.confirm.cancel")}
              </AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => {
                  void (async () => {
                    try {
                      await using run = appRun()
                      await run(deleteCatalogItem(item.id))
                      router.history.back()
                    } catch {
                      toast.error(t("settings.saveFailed"))
                    }
                  })()
                }}
              >
                {t("settings.items.delete.confirm.confirm")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  )
}
