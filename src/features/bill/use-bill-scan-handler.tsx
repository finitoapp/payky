import { useCallback, useState } from "react"
import type { CatalogCategoryRow } from "@/core/modules/catalog-category/catalog-category.ts"
import type { CatalogItemRow } from "@/core/modules/catalog-item/catalog-item.ts"
import { findCatalogItemsByScanCode } from "@/core/modules/catalog-item/catalog-item-utils.ts"
import type { FiatCurrency as FiatCurrencyType } from "@/core/modules/shared/schema.ts"
import { CreateCatalogItemDialog } from "@/features/bill/create-catalog-item-dialog.tsx"
import { ScanCodeCollisionDialog } from "@/features/bill/scan-code-collision-dialog.tsx"
import {
  useConfirmDialog,
  useIsConfirmDialogOpen,
} from "@/hooks/use-confirm-dialog.ts"
import { useProductLookup } from "@/hooks/use-product-lookup.ts"
import { useTranslation } from "@/hooks/use-translation.ts"

/**
 * What a scanned code does on `/bill`, whichever scanner read it — the
 * camera in scan mode or a hardware scanner at any time: a code matching one
 * item adds it, a code matching several asks which one, and an unknown code
 * offers to create the item (prefilled from the product lookup) and then
 * adds it. Render `dialogs` once; `dialogsOpen` pauses every scanner so a
 * code read behind an open dialog cannot add to the cart underneath it.
 */
export function useBillScanHandler({
  currencyItems,
  categories,
  currency,
  onAdd,
}: {
  readonly currencyItems: ReadonlyArray<CatalogItemRow>
  readonly categories: ReadonlyArray<CatalogCategoryRow>
  readonly currency: FiatCurrencyType
  readonly onAdd: (catalogItem: CatalogItemRow) => void
}) {
  const { t } = useTranslation()
  const confirm = useConfirmDialog()
  const isConfirmDialogOpen = useIsConfirmDialogOpen()
  const [lastScanned, setLastScanned] = useState<CatalogItemRow | null>(null)
  const [collisionCandidates, setCollisionCandidates] = useState<
    ReadonlyArray<CatalogItemRow>
  >([])
  const [createDialogCode, setCreateDialogCode] = useState<string | null>(null)
  // Set as soon as an unknown code is scanned, so the lookup runs while the
  // "unknown code" confirm is still open and the form opens prefilled.
  const [lookupCode, setLookupCode] = useState<string | null>(null)
  const productLookup = useProductLookup(lookupCode)

  const addScanned = useCallback(
    (item: CatalogItemRow) => {
      setLastScanned(item)
      onAdd(item)
    },
    [onAdd]
  )

  const handleScan = useCallback(
    (rawValue: string) => {
      const matches = findCatalogItemsByScanCode(currencyItems, rawValue)

      if (matches.length === 0) {
        setLookupCode(rawValue)
        void (async () => {
          const confirmed = await confirm({
            title: t("bill.scan.unknown.title"),
            description: <UnknownCodeDescription code={rawValue} />,
            confirmLabel: t("bill.scan.unknown.create"),
            cancelLabel: t("bill.scan.unknown.cancel"),
          })
          if (confirmed) setCreateDialogCode(rawValue)
          else setLookupCode(null)
        })()
        return
      }

      if (matches.length > 1) {
        setCollisionCandidates(matches)
        return
      }

      const [item] = matches
      if (item === undefined) return
      addScanned(item)
    },
    [currencyItems, addScanned, confirm, t]
  )

  const dialogsOpen =
    isConfirmDialogOpen ||
    collisionCandidates.length > 0 ||
    createDialogCode !== null

  const dialogs = (
    <>
      <ScanCodeCollisionDialog
        open={collisionCandidates.length > 0}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setCollisionCandidates([])
        }}
        candidates={collisionCandidates}
        onSelect={(item) => {
          setCollisionCandidates([])
          addScanned(item)
        }}
      />

      <CreateCatalogItemDialog
        open={createDialogCode !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setCreateDialogCode(null)
            setLookupCode(null)
          }
        }}
        scanCode={createDialogCode ?? ""}
        productLookup={productLookup}
        currency={currency}
        categories={categories}
        onCreated={(item) => {
          setCreateDialogCode(null)
          setLookupCode(null)
          addScanned(item)
        }}
      />
    </>
  )

  return { handleScan, lastScanned, dialogsOpen, dialogs }
}

/**
 * Rendered by the global confirm host, outside this view, so it subscribes to
 * the lookup itself — same query key as `useBillScanHandler`'s, so it shares
 * that request and fills in the moment the product is recognized.
 */
function UnknownCodeDescription({ code }: { readonly code: string }) {
  const { t } = useTranslation()
  const { product, isFetching } = useProductLookup(code)

  return (
    <>
      {t("bill.scan.unknown.description", { code })}
      {isFetching ? (
        <span className="mt-3 block">{t("bill.scan.lookup.loading")}</span>
      ) : product !== undefined ? (
        <span className="mt-3 block">
          {t("bill.scan.unknown.match")}
          <span className="block font-medium text-foreground">
            {product.name}
          </span>
          {product.description !== null && (
            <span className="block">{product.description}</span>
          )}
          <span className="mt-1 block text-xs">
            {t("bill.scan.lookup.source", { source: product.source })}
          </span>
        </span>
      ) : null}
    </>
  )
}
