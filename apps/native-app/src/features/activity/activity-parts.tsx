import { paymentMethodLabelKey } from "@payky/app-shared/activity-labels"
import type { AccountTransactionKind } from "@payky/core/modules/account-transaction/account-transaction-types"
import { ActivityIndicator, FlatList, Pressable } from "react-native"
import { Text, XStack, YStack } from "tamagui"
import { EmptyView } from "../../components/state-views.tsx"
import type { useTranslation } from "../../hooks/use-translation.ts"

/** The pieces the payment and bill lists share, so the two tabs read the same way. */

export type StatusTone = "success" | "warning" | "danger" | "muted"

const toneColors = {
  success: "green-600",
  warning: "orange-600",
  danger: "red-600",
  muted: "muted-foreground",
} as const satisfies Record<StatusTone, string>

/** The row's status as a ringed glyph; colour never carries it alone (the label is beside it). */
export function StatusDot({
  tone,
  glyph,
}: {
  readonly tone: StatusTone
  readonly glyph: string
}) {
  return (
    <YStack
      width={32}
      height={32}
      rounded={16}
      items="center"
      justify="center"
      borderWidth={1.5}
      borderColor={toneColors[tone]}
    >
      <Text color={toneColors[tone]} fontWeight="700">
        {glyph}
      </Text>
    </YStack>
  )
}

export function IssueBadges({
  issues,
}: {
  readonly issues: ReadonlyArray<string>
}) {
  if (issues.length === 0) return null

  return (
    <XStack flexWrap="wrap" gap="1.5">
      {issues.map((issue) => (
        <Text
          key={issue}
          fontSize={12}
          color="orange-600"
          borderWidth={1}
          borderColor="orange-600"
          rounded="sm"
          px="2"
        >
          {`⚠ ${issue}`}
        </Text>
      ))}
    </XStack>
  )
}

/** The methods that settled a payment, once each, as plain labels. */
export function paymentMethodsText(
  kinds: ReadonlyArray<AccountTransactionKind>,
  t: ReturnType<typeof useTranslation>["t"]
): string | null {
  const unique = Array.from(new Set(kinds), (kind) =>
    t(paymentMethodLabelKey[kind])
  )
  return unique.length === 0 ? null : unique.join(", ")
}

export interface ActivityRowData {
  /** Already translated or user-entered. */
  readonly title: string
  /** Time, table, tip, methods: one muted line. */
  readonly details: string
  readonly issues: ReadonlyArray<string>
  readonly refundLabel?: string | undefined
  readonly amount: string
  /** Struck through: money that never arrived and never will. */
  readonly isVoid: boolean
  readonly statusLabel: string
  readonly statusTone: StatusTone
  readonly statusGlyph: string
  readonly onPress: () => void
}

function ActivityRow({ row }: { readonly row: ActivityRowData }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${row.title}, ${row.amount}, ${row.statusLabel}`}
      onPress={row.onPress}
    >
      <XStack
        gap="3"
        py="3"
        px="3"
        items="center"
        borderLeftWidth={row.issues.length > 0 ? 3 : 0}
        borderLeftColor="orange-600"
      >
        <StatusDot tone={row.statusTone} glyph={row.statusGlyph} />
        <YStack flex={1} gap="1">
          <Text fontWeight="600" numberOfLines={1}>
            {row.title}
          </Text>
          <Text fontSize={12} color="muted-foreground">
            {row.details}
          </Text>
          <IssueBadges issues={row.issues} />
          {row.refundLabel === undefined ? null : (
            <Text fontSize={12} color="orange-600">
              {row.refundLabel}
            </Text>
          )}
        </YStack>
        <YStack items="flex-end" gap="1">
          <Text
            fontWeight="600"
            color={row.isVoid ? "muted-foreground" : "color"}
            textDecorationLine={row.isVoid ? "line-through" : "none"}
          >
            {row.amount}
          </Text>
          <Text fontSize={12} color="muted-foreground">
            {row.statusLabel}
          </Text>
        </YStack>
      </XStack>
    </Pressable>
  )
}

export interface ActivityGroup {
  readonly key: string
  /** The day heading with its total. */
  readonly title: string
  readonly rows: ReadonlyArray<{ readonly id: string } & ActivityRowData>
}

type ListEntry =
  | { readonly kind: "day"; readonly key: string; readonly title: string }
  | {
      readonly kind: "row"
      readonly key: string
      readonly row: ActivityRowData
    }

/**
 * Day-grouped, paginated list (`useInfinitePages`): headings and rows are one
 * flat `FlatList` with stable keys, so live updates move rows instead of
 * remounting the list.
 */
export function ActivityList({
  groups,
  emptyTitle,
  emptyDescription,
  hasMore,
  isPending,
  loadMore,
}: {
  readonly groups: ReadonlyArray<ActivityGroup>
  readonly emptyTitle: string
  readonly emptyDescription: string
  readonly hasMore: boolean
  readonly isPending: boolean
  readonly loadMore: () => void
}) {
  const entries = groups.flatMap(
    (group): ReadonlyArray<ListEntry> => [
      { kind: "day", key: `day:${group.key}`, title: group.title },
      ...group.rows.map((row) => ({
        kind: "row" as const,
        key: row.id,
        row,
      })),
    ]
  )

  return (
    <FlatList
      style={{ flex: 1 }}
      data={entries}
      keyExtractor={(entry) => entry.key}
      onEndReachedThreshold={0.5}
      onEndReached={() => {
        if (hasMore && !isPending) loadMore()
      }}
      ListEmptyComponent={
        <EmptyView message={`${emptyTitle}\n${emptyDescription}`} />
      }
      ListFooterComponent={
        hasMore ? <ActivityIndicator style={{ padding: 16 }} /> : undefined
      }
      renderItem={({ item }) =>
        item.kind === "day" ? (
          <Text
            fontSize={13}
            fontWeight="600"
            color="muted-foreground"
            pt="4"
            pb="1"
            px="3"
          >
            {item.title}
          </Text>
        ) : (
          <ActivityRow row={item.row} />
        )
      }
    />
  )
}
