import { formatMoney } from "@payky/app-shared/format-money"
import {
  canConfirmSplit,
  deriveSplitItems,
  type SplitBillConfirmInput,
  type SplitDestination,
  type SplitSelection,
  selectAllForSplit,
  setSplitQuantity,
} from "@payky/app-shared/split-selection"
import {
  type OpenBillRow,
  openBillsQuery,
} from "@payky/core/modules/bill/bill-queries"
import type { BillId } from "@payky/core/modules/bill/bill-types"
import type { BillLineSummary } from "@payky/core/modules/bill-line/bill-line-summary"
import {
  calculateBillLineSummaries,
  deriveBillSummaryStats,
} from "@payky/core/modules/bill-line/bill-line-utils"
import type { FiatCurrency } from "@payky/core/modules/shared/schema"
import { tablesQuery } from "@payky/core/modules/table/table-queries"
import { useMemo, useState } from "react"
import { Modal, Pressable, ScrollView } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { Text, useTheme, XStack, YStack } from "tamagui"
import { Button } from "../../components/ui/button.tsx"
import { useEvoluQuery } from "../../hooks/use-evolu-query.ts"
import { useLocale, useTranslation } from "../../hooks/use-translation.ts"

/**
 * Native counterpart of web's `SplitBillDialog`: pick how many units of each
 * line move to a new bill or an open one of the same currency. A full-screen
 * modal rather than a dialog; it has no text input, so no keyboard handling.
 * The selection lives in the mounted body, which exists only while open, so
 * every opening starts empty (cancel discards the draft, as on web).
 */
export function SplitBillDialog({
  open,
  onClose,
  billId,
  summaries,
  currency,
  pending,
  onConfirm,
}: {
  readonly open: boolean
  readonly onClose: () => void
  /** The current (source) bill, left out of the "existing bill" list. */
  readonly billId: BillId
  readonly summaries: ReadonlyArray<BillLineSummary>
  readonly currency: FiatCurrency
  readonly pending: boolean
  readonly onConfirm: (input: SplitBillConfirmInput) => void
}) {
  return (
    <Modal
      visible={open}
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {open ? (
        <SplitBillBody
          onClose={onClose}
          billId={billId}
          summaries={summaries}
          currency={currency}
          pending={pending}
          onConfirm={onConfirm}
        />
      ) : null}
    </Modal>
  )
}

function SplitBillBody({
  onClose,
  billId,
  summaries,
  currency,
  pending,
  onConfirm,
}: Omit<Parameters<typeof SplitBillDialog>[0], "open">) {
  const { t } = useTranslation()
  const locale = useLocale()
  const theme = useTheme()
  const [selected, setSelected] = useState<SplitSelection>({})
  const [destination, setDestination] = useState<SplitDestination>("new")
  const [targetBillId, setTargetBillId] = useState<BillId | null>(null)
  const openBills = useEvoluQuery(openBillsQuery).data
  const tables = useEvoluQuery(tablesQuery).data
  // Same currency only: a bill's lines are priced in its own currency.
  const otherOpenBills = useMemo(
    () =>
      openBills.filter(
        (candidate) =>
          candidate.id !== billId && candidate.currency === currency
      ),
    [openBills, billId, currency]
  )
  const items = useMemo(
    () => deriveSplitItems(summaries, selected),
    [summaries, selected]
  )
  const { itemCount, totalAmount } = deriveBillSummaryStats(items)
  const canConfirm = canConfirmSplit({
    itemCount: items.length,
    pending,
    destination,
    targetBillId,
  })

  const confirm = () => {
    if (destination === "new") {
      onConfirm({ destination: "new", items })
      return
    }
    if (targetBillId === null) return
    onConfirm({ destination: "existing", targetBillId, items })
  }

  return (
    <SafeAreaView
      style={{ flex: 1, padding: 16, backgroundColor: theme.background.val }}
    >
      <Text fontSize={24} fontWeight="600" accessibilityRole="header">
        {t("bill.split.title")}
      </Text>
      <Text color="muted-foreground" pb="3">
        {t("bill.split.description")}
      </Text>

      <XStack gap="2" pb="2">
        <YStack flex={1}>
          <Button
            size="lg"
            variant={destination === "new" ? "default" : "outline"}
            label={t("bill.split.destination.new")}
            onPress={() => setDestination("new")}
          />
        </YStack>
        <YStack flex={1}>
          <Button
            size="lg"
            variant={destination === "existing" ? "default" : "outline"}
            label={t("bill.split.destination.existing")}
            disabled={otherOpenBills.length === 0}
            onPress={() => setDestination("existing")}
          />
        </YStack>
      </XStack>

      <ScrollView style={{ flex: 1 }}>
        {destination === "existing" ? (
          <YStack gap="1" pb="3">
            {otherOpenBills.length === 0 ? (
              <Text color="muted-foreground">
                {t("bill.split.destination.existing.empty")}
              </Text>
            ) : (
              otherOpenBills.map((bill) => (
                <ExistingBillOption
                  key={bill.id}
                  bill={bill}
                  tableName={
                    tables.find((table) => table.id === bill.tableId)?.name ??
                    null
                  }
                  selected={bill.id === targetBillId}
                  onSelect={() => setTargetBillId(bill.id)}
                />
              ))
            )}
          </YStack>
        ) : null}

        <XStack justify="flex-end" gap="2" pb="2">
          <Button
            size="xs"
            variant="ghost"
            label={t("bill.split.selectAll")}
            onPress={() => setSelected(selectAllForSplit(summaries))}
          />
          <Button
            size="xs"
            variant="ghost"
            label={t("bill.split.clearSelection")}
            onPress={() => setSelected({})}
          />
        </XStack>

        {summaries.map((summary) => (
          <SplitBillRow
            key={summary.id}
            summary={summary}
            quantity={selected[summary.id] ?? 0}
            onChange={(quantity) =>
              setSelected((current) =>
                setSplitQuantity(current, summary, quantity)
              )
            }
          />
        ))}
      </ScrollView>

      <YStack gap="2" pt="3">
        <XStack justify="space-between">
          <Text fontWeight="600">
            {t("bill.split.selectedCount")} {itemCount}
          </Text>
          <Text fontWeight="600">
            {formatMoney({ value: totalAmount, currency }, locale)}
          </Text>
        </XStack>
        <XStack gap="2">
          <YStack flex={1}>
            <Button
              size="lg"
              variant="outline"
              label={t("bill.split.cancel")}
              onPress={onClose}
            />
          </YStack>
          <YStack flex={1}>
            <Button
              size="lg"
              label={t("bill.split.confirm")}
              pending={pending}
              disabled={!canConfirm}
              onPress={confirm}
            />
          </YStack>
        </XStack>
      </YStack>
    </SafeAreaView>
  )
}

function ExistingBillOption({
  bill,
  tableName,
  selected,
  onSelect,
}: {
  readonly bill: OpenBillRow
  readonly tableName: string | null
  readonly selected: boolean
  readonly onSelect: () => void
}) {
  const { t } = useTranslation()
  const locale = useLocale()
  const { itemCount, totalAmount } = useMemo(
    () =>
      deriveBillSummaryStats(
        calculateBillLineSummaries(bill.lines, bill.items)
      ),
    [bill]
  )

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onSelect}
    >
      <XStack
        gap="2"
        p="2"
        items="center"
        borderWidth={selected ? 2 : 1}
        borderColor={selected ? "primary" : "border-color"}
        rounded="md"
      >
        <YStack flex={1}>
          <Text fontWeight="600" numberOfLines={1}>
            {bill.label ?? t("bill.list.label", { number: bill.displayNumber })}
          </Text>
          {tableName === null ? null : (
            <Text color="muted-foreground" numberOfLines={1}>
              {tableName}
            </Text>
          )}
        </YStack>
        <YStack items="flex-end">
          <Text color="muted-foreground">
            {t("bill.itemsCount", { value: itemCount })}
          </Text>
          <Text fontWeight="600">
            {formatMoney(
              { value: totalAmount, currency: bill.currency },
              locale
            )}
          </Text>
        </YStack>
      </XStack>
    </Pressable>
  )
}

function SplitBillRow({
  summary,
  quantity,
  onChange,
}: {
  readonly summary: BillLineSummary
  readonly quantity: number
  readonly onChange: (quantity: number) => void
}) {
  const { t } = useTranslation()
  return (
    <XStack
      py="2"
      gap="2"
      items="center"
      borderBottomWidth={1}
      borderColor="border-color"
    >
      <YStack flex={1}>
        <Text fontWeight="600" numberOfLines={1}>
          {summary.name}
        </Text>
        <Text color="muted-foreground">
          {t("bill.split.availableCount", { value: summary.quantity })}
        </Text>
      </YStack>
      <StepButton
        label={t("bill.split.decrease.aria", { name: summary.name })}
        symbol="−"
        disabled={quantity === 0}
        onPress={() => onChange(quantity - 1)}
      />
      <Text minW={28} text="center" fontWeight="600">
        {quantity}
      </Text>
      <StepButton
        label={t("bill.split.increase.aria", { name: summary.name })}
        symbol="+"
        disabled={quantity >= summary.quantity}
        onPress={() => onChange(quantity + 1)}
      />
    </XStack>
  )
}

function StepButton({
  label,
  symbol,
  disabled,
  onPress,
}: {
  readonly label: string
  readonly symbol: string
  readonly disabled: boolean
  readonly onPress: () => void
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={6}
      style={{
        width: 40,
        height: 40,
        borderRadius: 20,
        borderWidth: 1,
        alignItems: "center",
        justifyContent: "center",
        opacity: disabled ? 0.4 : 1,
      }}
    >
      <Text fontSize={20}>{symbol}</Text>
    </Pressable>
  )
}
