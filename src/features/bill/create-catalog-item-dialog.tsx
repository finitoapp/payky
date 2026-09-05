import { useId, useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button.tsx"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx"
import {
  Field,
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
import type { CatalogCategoryRow } from "@/core/modules/catalog-category/catalog-category.ts"
import type { CatalogCategoryId } from "@/core/modules/catalog-category/catalog-category-types.ts"
import type { CatalogItemRow } from "@/core/modules/catalog-item/catalog-item.ts"
import { createCatalogItemAtEnd } from "@/core/modules/catalog-item/catalog-item-actions.ts"
import { catalogItemByIdQuery } from "@/core/modules/catalog-item/catalog-item-queries.ts"
import { decimalAmountToMinorUnits } from "@/core/modules/shared/money.ts"
import {
  type FiatCurrency as FiatCurrencyType,
  NonEmptyString255Schema,
  NonNegativeInteger,
} from "@/core/modules/shared/schema.ts"
import { useAppRun } from "@/hooks/use-app-run.ts"
import { useEvolu } from "@/hooks/use-evolu.ts"
import { useTranslation } from "@/hooks/use-translation.ts"
import type { TranslationKey } from "@/i18n/resources.ts"

/**
 * Lightweight create-item form opened from bill scan mode when a scanned
 * code matches no catalog item — just enough to add the item and keep
 * scanning (name, price, category). Anything else (description, etc.) is
 * left for the full form under Settings.
 */
export function CreateCatalogItemDialog({
  open,
  onOpenChange,
  scanCode,
  currency,
  categories,
  onCreated,
}: {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly scanCode: string
  readonly currency: FiatCurrencyType
  readonly categories: ReadonlyArray<CatalogCategoryRow>
  readonly onCreated: (item: CatalogItemRow) => void
}) {
  const appRun = useAppRun()
  const evolu = useEvolu()
  const { t } = useTranslation()
  const nameInputId = useId()
  const priceInputId = useId()
  const categoryInputId = useId()
  const [name, setName] = useState("")
  const [price, setPrice] = useState("")
  const [categoryId, setCategoryId] = useState<CatalogCategoryId | "none">(
    "none"
  )
  const [nameError, setNameError] = useState<TranslationKey | null>(null)
  const [priceError, setPriceError] = useState<TranslationKey | null>(null)
  const [pending, setPending] = useState(false)

  const resetForm = () => {
    setName("")
    setPrice("")
    setCategoryId("none")
    setNameError(null)
    setPriceError(null)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) resetForm()
        onOpenChange(nextOpen)
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("bill.scan.create.title")}</DialogTitle>
          <DialogDescription>
            {t("bill.scan.create.description", { code: scanCode })}
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(event) => {
            event.preventDefault()
            setNameError(null)
            setPriceError(null)

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

            const trimmedScanCode = scanCode.trim()
            const scanCodeResult = trimmedScanCode
              ? NonEmptyString255Schema.safeParse(trimmedScanCode)
              : null

            void (async () => {
              setPending(true)
              try {
                await using run = appRun()
                const id = await run.ok(
                  createCatalogItemAtEnd({
                    deviceId: null,
                    categoryId: categoryId === "none" ? null : categoryId,
                    name: nameResult.data,
                    description: null,
                    currency,
                    unitAmount,
                    scanCode: scanCodeResult?.data ?? null,
                  })
                )
                const [created] = await evolu.loadQuery(
                  catalogItemByIdQuery(id)
                )
                if (created === undefined) {
                  toast.error(t("settings.saveFailed"))
                  return
                }

                resetForm()
                onOpenChange(false)
                onCreated(created)
              } catch {
                toast.error(t("settings.saveFailed"))
              } finally {
                setPending(false)
              }
            })()
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
                autoFocus
                placeholder={t("settings.items.form.name.placeholder")}
                onChange={(event) => {
                  setName(event.currentTarget.value)
                  setNameError(null)
                }}
              />
              <FieldError>{nameError ? t(nameError) : null}</FieldError>
            </Field>

            <Field data-invalid={priceError !== null}>
              <FieldLabel htmlFor={priceInputId}>
                {t("settings.items.form.price.label")}
              </FieldLabel>
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
                }}
              />
              <FieldError>{priceError ? t(priceError) : null}</FieldError>
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
          </FieldGroup>

          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {t("bill.scan.create.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
