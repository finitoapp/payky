import { formatMoney } from "@payky/app-shared/format-money"
import {
  type OpenBillRow,
  openBillsQuery,
} from "@payky/core/modules/bill/bill-queries"
import type { BillId } from "@payky/core/modules/bill/bill-types"
import {
  calculateBillLineSummaries,
  deriveBillSummaryStats,
} from "@payky/core/modules/bill-line/bill-line-utils"
import type { TableRow } from "@payky/core/modules/table/table"
import { tablesQuery } from "@payky/core/modules/table/table-queries"
import type { TableId } from "@payky/core/modules/table/table-types"
import { useMemo } from "react"
import { FlatList, Modal, Pressable, View } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { Text, useTheme, YStack } from "tamagui"
import { AppButton } from "../../components/app-button.tsx"
import { TableTileShell } from "../../components/table-tile-shell.tsx"
import { useEvoluQuery } from "../../hooks/use-evolu-query.ts"
import { useLocale, useTranslation } from "../../hooks/use-translation.ts"

type PickerEntry = { readonly table: TableRow | null }

/**
 * Table picker for the bill, as web's `AssignTableDialog`: every table as an
 * occupancy tile (free, this bill's current table, or held by other bills),
 * so staff see which tables are free before assigning one.
 */
export function AssignTableDialog({
  open,
  onClose,
  billId,
  currentTableId,
  onAssign,
}: {
  readonly open: boolean
  readonly onClose: () => void
  readonly billId: BillId
  readonly currentTableId: TableId | null
  readonly onAssign: (tableId: TableId | null) => void
}) {
  const { t } = useTranslation()
  const theme = useTheme()
  const tables = useEvoluQuery(tablesQuery).data
  const openBills = useEvoluQuery(openBillsQuery).data

  // Excludes this bill's own row: its current table must not read as
  // "occupied by someone else" while it is the one being assigned.
  const otherBillsByTableId = useMemo(() => {
    const map = new Map<TableId, ReadonlyArray<OpenBillRow>>()
    for (const bill of openBills) {
      if (bill.tableId === null || bill.id === billId) continue
      map.set(bill.tableId, [...(map.get(bill.tableId) ?? []), bill])
    }
    return map
  }, [openBills, billId])
  const entries = useMemo<ReadonlyArray<PickerEntry>>(
    () => [{ table: null }, ...tables.map((table) => ({ table }))],
    [tables]
  )

  return (
    <Modal
      visible={open}
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <SafeAreaView
        style={{ flex: 1, padding: 16, backgroundColor: theme.background.val }}
      >
        <Text fontSize={24} fontWeight="600" accessibilityRole="header" pb="3">
          {t("bill.table.dialog.title")}
        </Text>
        <FlatList
          style={{ flex: 1 }}
          numColumns={2}
          data={entries}
          keyExtractor={(entry) => entry.table?.id ?? "none"}
          renderItem={({ item: { table } }) => (
            <View style={{ width: "50%", padding: 4 }}>
              {table === null ? (
                <NoTableTile
                  selected={currentTableId === null}
                  onSelect={() => onAssign(null)}
                />
              ) : (
                <TableAssignmentTile
                  table={table}
                  bills={otherBillsByTableId.get(table.id) ?? []}
                  selected={currentTableId === table.id}
                  onSelect={() => onAssign(table.id)}
                />
              )}
            </View>
          )}
        />
        <YStack pt="3">
          <AppButton
            variant="secondary"
            label={t("paymentWait.back")}
            onPress={onClose}
          />
        </YStack>
      </SafeAreaView>
    </Modal>
  )
}

function NoTableTile({
  selected,
  onSelect,
}: {
  readonly selected: boolean
  readonly onSelect: () => void
}) {
  const { t } = useTranslation()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onSelect}
      style={{ flex: 1 }}
    >
      <TableTileShell
        name={t("bill.table.dialog.none")}
        occupied={false}
        selected={selected}
      >
        {null}
      </TableTileShell>
    </Pressable>
  )
}

function TableAssignmentTile({
  table,
  bills,
  selected,
  onSelect,
}: {
  readonly table: TableRow
  readonly bills: ReadonlyArray<OpenBillRow>
  readonly selected: boolean
  readonly onSelect: () => void
}) {
  const { t } = useTranslation()
  const locale = useLocale()
  const [onlyBill] = bills

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onSelect}
      style={{ flex: 1 }}
    >
      <TableTileShell
        name={table.name}
        subtitle={t("tables.seatCount", { value: table.seatCount })}
        occupied={bills.length > 0}
        selected={selected}
      >
        {onlyBill === undefined ? (
          <Text color="muted-foreground">{t("tables.tile.free")}</Text>
        ) : bills.length === 1 ? (
          // Derived from the row's embedded lines/items: no query of its own.
          <OccupiedSummary bill={onlyBill} locale={locale} />
        ) : (
          <Text color="muted-foreground">
            {t("tables.tile.multipleBills", { value: bills.length })}
          </Text>
        )}
      </TableTileShell>
    </Pressable>
  )
}

function OccupiedSummary({
  bill,
  locale,
}: {
  readonly bill: OpenBillRow
  readonly locale: string
}) {
  const { t } = useTranslation()
  const { itemCount, totalAmount } = useMemo(
    () =>
      deriveBillSummaryStats(
        calculateBillLineSummaries(bill.lines, bill.items)
      ),
    [bill]
  )
  return (
    <YStack>
      <Text color="muted-foreground">
        {t("bill.itemsCount", { value: itemCount })}
      </Text>
      <Text fontWeight="600">
        {formatMoney({ value: totalAmount, currency: bill.currency }, locale)}
      </Text>
    </YStack>
  )
}
