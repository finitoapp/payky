import { formatElapsed } from "@payky/app-shared/format-elapsed"
import { formatMoney } from "@payky/app-shared/format-money"
import type { TranslationKey } from "@payky/app-shared/i18n/resources"
import {
  type BillWithStats,
  billPaymentState,
  buildBillRows,
  elapsedSeverity,
  groupBillRowsByTableId,
  matchesTableFilter,
  sumBillRows,
  type TableFilter,
  TableFilterSchema,
  tablePaymentState,
} from "@payky/app-shared/pos-overview"
import type { OpenBillRow } from "@payky/core/modules/bill/bill-queries"
import { openBillsQuery } from "@payky/core/modules/bill/bill-queries"
import { createRandomBillId } from "@payky/core/modules/bill/bill-types"
import type { TableRow } from "@payky/core/modules/table/table"
import { tablesQuery } from "@payky/core/modules/table/table-queries"
import type { TableId } from "@payky/core/modules/table/table-types"
import { router } from "expo-router"
import { useEffect, useMemo, useState } from "react"
import { FlatList, Pressable, ScrollView, View } from "react-native"
import { Text, XStack, YStack } from "tamagui"
import { TableTileShell } from "../../components/table-tile-shell.tsx"
import { Button } from "../../components/ui/button.tsx"
import { useEvoluQuery } from "../../hooks/use-evolu-query.ts"
import { useLocale, useTranslation } from "../../hooks/use-translation.ts"

const tableFilterLabelKeys = {
  all: "home.pos.filter.all",
  occupied: "home.pos.filter.occupied",
  free: "home.pos.filter.free",
} as const satisfies Record<TableFilter, TranslationKey>

const elapsedColors = {
  normal: "muted-foreground",
  long: "warning",
  veryLong: "destructive",
} as const satisfies Record<ReturnType<typeof elapsedSeverity>, string>

type TFn = ReturnType<typeof useTranslation>["t"]

const billLabel = (bill: OpenBillRow, t: TFn) =>
  bill.label ?? t("bill.list.label", { number: bill.displayNumber })

const openBill = (billId: string) =>
  router.push({ pathname: "/bill", params: { billId } })

/**
 * The id is minted once per mounted button, as web's `NewBillLink`, so the
 * `/bill` URL is stable before the first tap and a bill left empty is
 * reopened rather than abandoned.
 */
function useNewBill(tableId: TableId | undefined) {
  const [billId] = useState(createRandomBillId)
  return () =>
    router.push({
      pathname: "/bill",
      params: tableId === undefined ? { billId } : { billId, tableId },
    })
}

/**
 * The POS home screen as on web: floor stats with a free/occupied filter, a
 * "no table" strip that starts a quick bill, and one tile per table. Web
 * keeps the filter in localStorage; here it is plain screen state.
 */
export function PosOverviewPage() {
  const { t } = useTranslation()
  const locale = useLocale()
  const tables = useEvoluQuery(tablesQuery).data
  const openBills = useEvoluQuery(openBillsQuery).data
  const [tableFilter, setTableFilter] = useState<TableFilter>("all")
  // ponytail: 30 s tick, as web — an expired invoice's "paying" state can
  // outlive `expiresAt` by up to that.
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(timer)
  }, [])

  const rows = useMemo(() => buildBillRows(openBills), [openBills])
  const rowsByTableId = useMemo(() => groupBillRowsByTableId(rows), [rows])
  const tiles = tables.map((table) => ({
    table,
    rows: rowsByTableId.get(table.id) ?? [],
  }))
  const occupiedCount = tiles.filter((tile) => tile.rows.length > 0).length
  const visibleTiles = tiles.filter((tile) =>
    matchesTableFilter(tableFilter, tile.rows.length > 0)
  )
  const floorTotal = sumBillRows(rows)

  return (
    <FlatList
      style={{ flex: 1 }}
      numColumns={2}
      data={visibleTiles}
      keyExtractor={(tile) => tile.table.id}
      ListHeaderComponent={
        <YStack gap="3" pb="2">
          <XStack gap="5" items="flex-end">
            {tables.length > 0 && (
              <FloorStat
                label={t("home.pos.stats.tables")}
                value={`${occupiedCount} / ${tables.length}`}
              />
            )}
            <FloorStat label={t("home.pos.stats.bills")} value={rows.length} />
            {floorTotal !== undefined && (
              <FloorStat
                label={t("home.pos.stats.total")}
                value={formatMoney(floorTotal, locale)}
              />
            )}
          </XStack>
          {tables.length > 0 && (
            <XStack gap="2">
              {TableFilterSchema.options.map((filter) => (
                <XStack key={filter} flex={1}>
                  <Button
                    size="lg"
                    label={t(tableFilterLabelKeys[filter])}
                    variant={filter === tableFilter ? "default" : "outline"}
                    onPress={() => setTableFilter(filter)}
                  />
                </XStack>
              ))}
            </XStack>
          )}
          <NoTableStrip rows={rowsByTableId.get(null) ?? []} now={now} />
        </YStack>
      }
      ListEmptyComponent={
        <Text color="muted-foreground" text="center" py="4">
          {tables.length === 0
            ? t("home.pos.noTables")
            : t(
                tableFilter === "free"
                  ? "home.pos.noneFree"
                  : "home.pos.noneOccupied"
              )}
        </Text>
      }
      renderItem={({ item }) => (
        <View style={{ width: "50%", padding: 4 }}>
          <TableTile table={item.table} rows={item.rows} now={now} />
        </View>
      )}
    />
  )
}

function FloorStat({
  label,
  value,
}: {
  readonly label: string
  readonly value: string | number
}) {
  return (
    <YStack>
      <Text fontSize={12} color="muted-foreground">
        {label}
      </Text>
      <Text fontSize={18} fontWeight="600">
        {value}
      </Text>
    </YStack>
  )
}

/** The open bills on no table, and the quick bill that starts another. */
function NoTableStrip({
  rows,
  now,
}: {
  readonly rows: ReadonlyArray<BillWithStats>
  readonly now: number
}) {
  const { t } = useTranslation()
  const newBill = useNewBill(undefined)

  return (
    <YStack
      gap="2"
      p="3"
      rounded="xl"
      borderWidth={1}
      borderColor="border-color"
      bg="card"
    >
      <XStack items="center" justify="space-between" gap="2">
        <Text fontWeight="600">{t("bill.table.dialog.none")}</Text>
        <XStack>
          <Button
            size="lg"
            label={`+ ${t("tables.tile.newBill")}`}
            onPress={newBill}
          />
        </XStack>
      </XStack>
      {rows.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <XStack gap="2">
            {rows.map((row) => (
              <BillChip key={row.bill.id} {...row} now={now} />
            ))}
          </XStack>
        </ScrollView>
      ) : (
        <Text color="muted-foreground">{t("home.pos.noTable.empty")}</Text>
      )}
    </YStack>
  )
}

/**
 * One table: its name, then on an occupied one the running total, how long it
 * has been open, the pieces and where payment stands. A free tile starts a
 * bill anywhere it is tapped and a tile with one bill opens it; with several,
 * each is a chip. The "+" starts another bill on the same table (a split check).
 */
function TableTile({
  table,
  rows,
  now,
}: {
  readonly table: TableRow
  readonly rows: ReadonlyArray<BillWithStats>
  readonly now: number
}) {
  const { t } = useTranslation()
  const locale = useLocale()
  const newBill = useNewBill(table.id)
  const occupied = rows.length > 0
  const onlyBill = rows.length === 1 ? rows[0]?.bill : undefined
  const total = sumBillRows(rows)
  const elapsedMs =
    now -
    Math.min(...rows.map(({ bill }) => new Date(bill.createdAt).getTime()))
  const itemCount = rows.reduce((sum, { stats }) => sum + stats.itemCount, 0)
  const paymentState = tablePaymentState(rows, now)

  const tile = (
    <TableTileShell
      name={table.name}
      occupied={occupied}
      attention={paymentState !== undefined}
    >
      {rows.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <XStack gap="2">
            {rows.map((row) => (
              <BillChip
                key={row.bill.id}
                {...row}
                now={now}
                showElapsed={false}
              />
            ))}
          </XStack>
        </ScrollView>
      )}
      {total !== undefined && (
        <Text fontSize={20} fontWeight="700" numberOfLines={1}>
          {formatMoney(total, locale)}
        </Text>
      )}
      {occupied ? (
        <XStack gap="2" flexWrap="wrap">
          <Text color={elapsedColors[elapsedSeverity(elapsedMs)]}>
            {formatElapsed(elapsedMs, locale)}
          </Text>
          <Text color="muted-foreground">
            {t("tables.tile.itemCount", { value: itemCount })}
          </Text>
          {paymentState !== undefined && (
            <Text color="info" fontWeight="600">
              {t(`tables.tile.${paymentState}`)}
            </Text>
          )}
        </XStack>
      ) : (
        <XStack gap="2">
          <Text color="muted-foreground">{t("tables.tile.free")}</Text>
          <Text color="muted-foreground">
            {t("tables.seatCount", { value: table.seatCount })}
          </Text>
        </XStack>
      )}
    </TableTileShell>
  )

  // A tile with several bills has no single target: its chips and "+" act.
  const onPress = !occupied
    ? newBill
    : onlyBill === undefined
      ? undefined
      : () => openBill(onlyBill.id)

  return (
    <View style={{ flex: 1 }}>
      {onPress === undefined ? (
        tile
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            onlyBill === undefined
              ? t("tables.tile.newBill")
              : billLabel(onlyBill, t)
          }
          onPress={onPress}
          style={{ flex: 1 }}
        >
          {tile}
        </Pressable>
      )}
      {occupied && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("tables.tile.newBill")}
          onPress={newBill}
          // Above the tile: on Android an elevated card otherwise draws over,
          // and catches the touch of, a sibling without elevation.
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            minWidth: 48,
            minHeight: 48,
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1,
            elevation: 8,
          }}
        >
          <Text fontSize={22} fontWeight="600">
            +
          </Text>
        </Pressable>
      )}
    </View>
  )
}

/**
 * One open bill as a chip: its total and, off a table, how long it has been
 * open, a dot while its payment is under way, and its label when it has one.
 */
function BillChip({
  bill,
  stats,
  now,
  showElapsed = true,
}: BillWithStats & {
  readonly now: number
  readonly showElapsed?: boolean
}) {
  const { t } = useTranslation()
  const locale = useLocale()
  const elapsedMs = now - new Date(bill.createdAt).getTime()
  const paymentState = billPaymentState(bill, now)

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={billLabel(bill, t)}
      onPress={() => openBill(bill.id)}
      style={{ minHeight: 44, justifyContent: "center" }}
    >
      <XStack
        items="center"
        gap="2"
        px="3"
        py="2"
        rounded="lg"
        borderWidth={1}
        borderColor="border-color"
      >
        {paymentState !== undefined && (
          <View
            style={{
              width: 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: "#2563eb",
            }}
          />
        )}
        {bill.label !== null && (
          <Text color="muted-foreground" numberOfLines={1} maxW={96}>
            {bill.label}
          </Text>
        )}
        <Text fontWeight="600">
          {formatMoney(
            { value: stats.totalAmount, currency: bill.currency },
            locale
          )}
        </Text>
        {showElapsed && (
          <Text color={elapsedColors[elapsedSeverity(elapsedMs)]} fontSize={12}>
            {formatElapsed(elapsedMs, locale)}
          </Text>
        )}
      </XStack>
    </Pressable>
  )
}
