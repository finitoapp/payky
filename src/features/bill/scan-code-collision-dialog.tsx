import { Card } from "@/components/ui/card.tsx"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx"
import type { CatalogItemRow } from "@/core/modules/catalog-item/catalog-item.ts"
import { getStaffDisplayName } from "@/core/modules/catalog-item/catalog-item-utils.ts"
import { useLocale } from "@/hooks/use-locale.ts"
import { useTranslation } from "@/hooks/use-translation.ts"
import { formatMoney } from "@/lib/format-utils.ts"

/**
 * `scanCode` uniqueness can't be enforced across devices (see
 * `findCatalogItemsByScanCode`), so scanning a code assigned to more than
 * one catalog item is an expected outcome, not an error — this dialog lets
 * staff pick which one they actually meant to add.
 */
export function ScanCodeCollisionDialog({
  open,
  onOpenChange,
  candidates,
  onSelect,
}: {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly candidates: ReadonlyArray<CatalogItemRow>
  readonly onSelect: (item: CatalogItemRow) => void
}) {
  const { t } = useTranslation()
  const locale = useLocale()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("bill.scan.collision.title")}</DialogTitle>
          <DialogDescription>
            {t("bill.scan.collision.description")}
          </DialogDescription>
        </DialogHeader>
        <div className="flex max-h-[60vh] flex-col gap-2 overflow-y-auto">
          {candidates.map((candidate) => (
            <button
              key={candidate.id}
              type="button"
              className="block rounded-xl text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              onClick={() => onSelect(candidate)}
            >
              <Card className="flex-row items-center justify-between gap-2 px-4 py-3">
                <p className="font-medium">{getStaffDisplayName(candidate)}</p>
                <p className="text-sm text-muted-foreground">
                  {formatMoney(
                    {
                      value: candidate.unitAmount,
                      currency: candidate.currency,
                    },
                    locale
                  )}
                </p>
              </Card>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
