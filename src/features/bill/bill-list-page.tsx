import { Link } from "@tanstack/react-router"
import { PlusIcon, ReceiptIcon, Trash2Icon } from "lucide-react"
import { useMemo, useState } from "react"
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
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group.tsx"
import type { BillRow } from "@/core/modules/bill/bill.ts"
import { cancelBill } from "@/core/modules/bill/bill-actions.ts"
import { openBillsQuery } from "@/core/modules/bill/bill-queries.ts"
import { NonNegativeInteger } from "@/core/modules/shared/schema.ts"
import { tablesQuery } from "@/core/modules/table/table-queries.ts"
import type { TableId } from "@/core/modules/table/table-types.ts"
import { useBillLineSummaries } from "@/features/bill/use-bill-line-summaries.ts"
import { useAppRun } from "@/hooks/use-app-run.ts"
import { useConsole } from "@/hooks/use-console.ts"
import { useEvoluQuery } from "@/hooks/use-evolu-query.ts"
import { useLocale } from "@/hooks/use-locale.ts"
import { useTranslation } from "@/hooks/use-translation.ts"
import { formatMoney } from "@/lib/format-utils.ts"

type TableFilter = "all" | "none" | TableId

export function BillListPage({
  initialTableId,
}: {
  readonly initialTableId?: TableId
}) {
  const { t } = useTranslation()
  const { data: bills } = useEvoluQuery(openBillsQuery)
  const { data: tables } = useEvoluQuery(tablesQuery)
  const [tableFilter, setTableFilter] = useState<TableFilter>(
    initialTableId ?? "all"
  )
  const tableNameById = useMemo(
    () => new Map(tables.map((table) => [table.id, table.name])),
    [tables]
  )
  const usedTableIds = useMemo(
    () => new Set(bills.map((bill) => bill.tableId)),
    [bills]
  )
  const availableTables = useMemo(
    () => tables.filter((table) => usedTableIds.has(table.id)),
    [tables, usedTableIds]
  )
  const showNoTableFilter = usedTableIds.has(null)
  const filteredBills = useMemo(() => {
    if (tableFilter === "all") return bills
    if (tableFilter === "none")
      return bills.filter((bill) => bill.tableId === null)
    return bills.filter((bill) => bill.tableId === tableFilter)
  }, [bills, tableFilter])
  const sortedBills = useMemo(
    () => [...filteredBills].sort((a, b) => b.displayNumber - a.displayNumber),
    [filteredBills]
  )

  return (
    <>
      <div className="h-6" />
      <FadeHeader
        title={t("bill.list.title")}
        endAddon={
          <Button
            variant="ghost"
            nativeButton={false}
            render={<Link aria-label={t("bill.list.new.aria")} to="/bill" />}
          >
            <PlusIcon className="size-5 text-primary" strokeWidth={3} />
          </Button>
        }
      />

      {availableTables.length > 0 && (
        <div className="mb-3 overflow-x-auto">
          <ToggleGroup<TableFilter>
            value={[tableFilter]}
            onValueChange={(nextValue) => {
              const [nextFilter] = nextValue
              if (nextFilter === undefined) return
              setTableFilter(nextFilter)
            }}
            variant="outline"
            size="sm"
            className="w-max"
          >
            <ToggleGroupItem value="all">
              {t("bill.list.table.all")}
            </ToggleGroupItem>
            {availableTables.map((table) => (
              <ToggleGroupItem key={table.id} value={table.id}>
                {table.name}
              </ToggleGroupItem>
            ))}
            {showNoTableFilter && (
              <ToggleGroupItem value="none">
                {t("bill.list.table.none")}
              </ToggleGroupItem>
            )}
          </ToggleGroup>
        </div>
      )}

      {sortedBills.length === 0 ? (
        <div className="mt-16 flex flex-col items-center gap-2 text-center">
          <p className="text-lg font-semibold">{t("bill.list.empty.title")}</p>
          <p className="max-w-72 text-balance text-sm text-muted-foreground">
            {t("bill.list.empty.description")}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {sortedBills.map((bill) => (
            <OpenBillRow
              key={bill.id}
              bill={bill}
              tableName={
                bill.tableId === null
                  ? null
                  : (tableNameById.get(bill.tableId) ?? null)
              }
            />
          ))}
        </div>
      )}
    </>
  )
}

function OpenBillRow({
  bill,
  tableName,
}: {
  readonly bill: BillRow
  readonly tableName: string | null
}) {
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
        to="/bill"
        search={{ billId: bill.id }}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-lg"
      >
        <div className="flex size-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <ReceiptIcon />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">
            {bill.label ?? t("bill.list.label", { number: bill.displayNumber })}
          </p>
          <p className="text-sm text-muted-foreground">
            {t("bill.itemsCount", { value: itemCount })}
          </p>
          {tableName !== null && (
            <p className="truncate text-xs text-muted-foreground">
              {tableName}
            </p>
          )}
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
              aria-label={t("bill.discard")}
              className="text-destructive"
            >
              <Trash2Icon />
            </Button>
          }
        />
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("bill.discard.confirm.title")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("bill.discard.confirm.description")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              {t("bill.discard.confirm.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => void handleDiscard()}
            >
              {t("bill.discard.confirm.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
