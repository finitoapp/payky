import { Link } from "@tanstack/react-router"
import { PlusIcon, ReceiptIcon, Trash2Icon } from "lucide-react"
import { useMemo } from "react"
import { toast } from "sonner"

import { FadeHeader } from "@/components/fade-header.tsx"
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
import type { BillRow } from "@/core/modules/bill/bill.ts"
import { cancelBill } from "@/core/modules/bill/bill-actions.ts"
import { openBillsQuery } from "@/core/modules/bill/bill-queries.ts"
import { NonNegativeInteger } from "@/core/modules/shared/schema.ts"
import { useBillLineSummaries } from "@/features/checkout/use-bill-line-summaries.ts"
import { useAppRun } from "@/hooks/use-app-run.ts"
import { useConsole } from "@/hooks/use-console.ts"
import { useEvoluQuery } from "@/hooks/use-evolu-query.ts"
import { useLocale } from "@/hooks/use-locale.ts"
import { useTranslation } from "@/hooks/use-translation.ts"
import { formatMoney } from "@/lib/format-utils.ts"

export function OpenBillsPage() {
  const { t } = useTranslation()
  const { data: bills } = useEvoluQuery(openBillsQuery)
  const sortedBills = useMemo(
    () => [...bills].sort((a, b) => b.displayNumber - a.displayNumber),
    [bills]
  )

  return (
    <>
      <div className="h-6" />
      <FadeHeader
        title={t("checkout.bills.title")}
        endAddon={
          <Button
            variant="ghost"
            nativeButton={false}
            render={
              <Link aria-label={t("checkout.bills.new.aria")} to="/checkout" />
            }
          >
            <PlusIcon className="size-5 text-primary" strokeWidth={3} />
          </Button>
        }
      />

      {sortedBills.length === 0 ? (
        <div className="mt-16 flex flex-col items-center gap-2 text-center">
          <p className="text-lg font-semibold">
            {t("checkout.bills.empty.title")}
          </p>
          <p className="max-w-72 text-balance text-sm text-muted-foreground">
            {t("checkout.bills.empty.description")}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {sortedBills.map((bill) => (
            <OpenBillRow key={bill.id} bill={bill} />
          ))}
        </div>
      )}
    </>
  )
}

function OpenBillRow({ bill }: { readonly bill: BillRow }) {
  const { t } = useTranslation()
  const locale = useLocale()
  const appRun = useAppRun()
  const console = useConsole()
  const summaries = useBillLineSummaries(bill.id)
  const totalAmount = useMemo(
    () =>
      NonNegativeInteger(
        summaries.reduce((sum, summary) => sum + summary.totalAmount, 0)
      ),
    [summaries]
  )
  const itemCount = useMemo(
    () => summaries.reduce((sum, summary) => sum + summary.quantity, 0),
    [summaries]
  )
  const handleDiscard = async () => {
    try {
      await using run = appRun()
      await run.orThrow(cancelBill(bill.id))
    } catch (error) {
      console.error("Failed to discard cart", error)
      toast.error(t("settings.saveFailed"))
    }
  }

  return (
    <div className="flex items-center rounded-xl bg-card ring-1 ring-foreground/10 p-2 gap-3">
      <Link
        to="/checkout"
        search={{ billId: bill.id }}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-lg"
      >
        <div className="flex size-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <ReceiptIcon />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">
            {bill.label ??
              t("checkout.bills.label", { number: bill.displayNumber })}
          </p>
          <p className="text-sm text-muted-foreground">
            {t("checkout.itemsCount", { value: itemCount })}
          </p>
        </div>
        <p className="font-semibold">
          {formatMoney({ value: totalAmount, currency: bill.currency }, locale)}
        </p>
      </Link>
      <AlertDialog>
        <AlertDialogTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              aria-label={t("checkout.discard")}
              className="text-destructive"
            >
              <Trash2Icon />
            </Button>
          }
        />
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("checkout.discard.confirm.title")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("checkout.discard.confirm.description")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              {t("checkout.discard.confirm.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => void handleDiscard()}
            >
              {t("checkout.discard.confirm.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
