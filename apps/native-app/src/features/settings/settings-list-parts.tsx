import type { Query, QueryRows, Row } from "@evolu/common"
import type { EvoluSchema } from "@payky/core/evolu/schema"
import { router } from "expo-router"
import { type ReactNode, Suspense } from "react"
import { ActivityIndicator, FlatList, Pressable } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { Text, useTheme, XStack, YStack } from "tamagui"
import { ScreenHeader } from "../../components/screen-header.tsx"
import { LoadingView } from "../../components/state-views.tsx"
import { useInfiniteEvoluQuery } from "../../hooks/use-infinite-evolu-query.ts"

/**
 * The frame every settings list screen shares, as web's `SettingsListPage`: a
 * title, a "+" to the create route, and a non-scrolling body so the list
 * inside can be a virtualized `FlatList`. `addLabel` is already translated.
 */
export function SettingsListShell({
  title,
  addLabel,
  addHref,
  children,
}: {
  readonly title: string
  readonly addLabel: string
  readonly addHref?: string
  readonly children: ReactNode
}) {
  const theme = useTheme()
  return (
    <SafeAreaView
      style={{ flex: 1, padding: 16, backgroundColor: theme.background.val }}
    >
      <ScreenHeader
        title={title}
        endAction={
          addHref === undefined ? null : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={addLabel}
              hitSlop={8}
              style={{
                minWidth: 44,
                minHeight: 44,
                alignItems: "center",
                justifyContent: "center",
              }}
              onPress={() => router.push(addHref)}
            >
              <Text fontSize={28} color="primary">
                +
              </Text>
            </Pressable>
          )
        }
      />
      <Suspense fallback={<LoadingView />}>{children}</Suspense>
    </SafeAreaView>
  )
}

/** What a list row shows; every text is already translated. */
export interface SettingsListRowData {
  readonly id: string
  readonly title: string
  readonly subtitle?: string | undefined
  readonly trailing?: string | undefined
  /** The edit screen the row opens. */
  readonly href?: string | undefined
}

function SettingsListRow({ row }: { readonly row: SettingsListRowData }) {
  const { href } = row
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={row.title}
      disabled={href === undefined}
      onPress={() => href !== undefined && router.push(href)}
    >
      <XStack
        minH={56}
        items="center"
        gap="3"
        px="3"
        py="2"
        rounded="lg"
        borderWidth={1}
        borderColor="border-color"
      >
        <YStack flex={1}>
          <Text fontWeight="600" numberOfLines={1}>
            {row.title}
          </Text>
          {row.subtitle === undefined ? null : (
            <Text fontSize={13} color="muted-foreground" numberOfLines={1}>
              {row.subtitle}
            </Text>
          )}
        </YStack>
        {row.trailing === undefined ? null : (
          <Text color="muted-foreground" numberOfLines={1}>
            {row.trailing}
          </Text>
        )}
        {href === undefined ? null : <Text color="muted-foreground">›</Text>}
      </XStack>
    </Pressable>
  )
}

/**
 * Paginated, virtualized list of a settings entity, as web's
 * `SettingsEntityList`: filtering runs in SQL inside `createPageQuery`, and
 * `deps` lists what it closes over. `hasAny` tells a screen with no records
 * (the pitch for the first one) from a search that matched nothing.
 */
export function SettingsEntityList<R extends Row>({
  deps,
  createPageQuery,
  renderRow,
  hasAny,
  emptyTitle,
  emptyDescription,
  emptySearchLabel,
}: {
  readonly deps: readonly unknown[]
  readonly createPageQuery: (limit: number) => Query<EvoluSchema, R>
  readonly renderRow: (row: QueryRows<R>[number]) => SettingsListRowData
  readonly hasAny: boolean
  /** Already translated. */
  readonly emptyTitle: string
  readonly emptyDescription: string
  readonly emptySearchLabel: string
}) {
  const { rows, hasMore, isPending, loadMore } = useInfiniteEvoluQuery(
    deps,
    createPageQuery
  )

  return (
    <FlatList
      style={{ flex: 1 }}
      contentContainerStyle={{ gap: 8, paddingBottom: 16 }}
      keyboardShouldPersistTaps="handled"
      data={rows.map(renderRow)}
      keyExtractor={(row) => row.id}
      onEndReachedThreshold={0.5}
      onEndReached={() => {
        if (hasMore && !isPending) loadMore()
      }}
      ListEmptyComponent={
        hasAny ? (
          <Text color="muted-foreground" text="center" py="6">
            {emptySearchLabel}
          </Text>
        ) : (
          <YStack items="center" gap="2" py="6">
            <Text fontSize={18} fontWeight="700" text="center">
              {emptyTitle}
            </Text>
            <Text color="muted-foreground" text="center">
              {emptyDescription}
            </Text>
          </YStack>
        )
      }
      ListFooterComponent={
        hasMore ? <ActivityIndicator style={{ padding: 16 }} /> : undefined
      }
      renderItem={({ item }) => <SettingsListRow row={item} />}
    />
  )
}
