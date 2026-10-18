import { formatRelativeDate, formatTime } from "@payky/app-shared/format-date"
import { formatSatsAmount } from "@payky/app-shared/format-money"
import { groupByDay } from "@payky/app-shared/group-by-day"
import {
  shortWithdrawalDestination,
  withdrawalKindKeys,
} from "@payky/app-shared/withdraw-display"
import type { AccountId } from "@payky/core/modules/account/account-types"
import {
  toWithdrawalView,
  type WithdrawalView,
  withdrawalsByAccountQuery,
} from "@payky/core/modules/withdraw/withdraw-queries"
import { router } from "expo-router"
import { Suspense } from "react"
import { ActivityIndicator, FlatList, Pressable } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { Text, useTheme, XStack, YStack } from "tamagui"
import { ScreenHeader } from "../../components/screen-header.tsx"
import { EmptyView, LoadingView } from "../../components/state-views.tsx"
import { useInfiniteEvoluQuery } from "../../hooks/use-infinite-evolu-query.ts"
import { useLocale, useTranslation } from "../../hooks/use-translation.ts"
import {
  useBtcFiat,
  useSparkAccountId,
  useSparkBalance,
} from "./use-withdraw-data.ts"
import { WithdrawalStatusBadge } from "./withdraw-parts.tsx"

/** `/withdraw`: the Spark wallet's withdrawals, newest first. */
export function WithdrawHistoryPage() {
  const theme = useTheme()
  const { t } = useTranslation()

  return (
    <SafeAreaView
      style={{ flex: 1, padding: 16, backgroundColor: theme.background.val }}
    >
      <ScreenHeader title={t("withdraw.history.title")} />
      <Suspense fallback={<LoadingView />}>
        <WithdrawHistoryBody />
      </Suspense>
    </SafeAreaView>
  )
}

function WithdrawHistoryBody() {
  const { t } = useTranslation()
  const accountId = useSparkAccountId()
  if (accountId === undefined) {
    return (
      <EmptyView
        message={`${t("withdraw.noAccount.title")}\n${t("withdraw.noAccount.description")}`}
      />
    )
  }
  return <WithdrawHistory accountId={accountId} />
}

type ListEntry =
  | { readonly kind: "day"; readonly key: string; readonly title: string }
  | {
      readonly kind: "row"
      readonly key: string
      readonly view: WithdrawalView
    }

function WithdrawHistory({ accountId }: { readonly accountId: AccountId }) {
  const { t } = useTranslation()
  const locale = useLocale()
  const balance = useSparkBalance(accountId)
  const fiat = useBtcFiat()
  const { rows, hasMore, isPending, loadMore } = useInfiniteEvoluQuery(
    [accountId],
    (limit) => withdrawalsByAccountQuery(accountId, limit)
  )
  const views = rows.flatMap((row): ReadonlyArray<WithdrawalView> => {
    const view = toWithdrawalView(row)
    return view === null ? [] : [view]
  })
  const now = new Date()
  const entries = groupByDay(views, (view) => new Date(view.createdAt)).flatMap(
    (group): ReadonlyArray<ListEntry> => [
      {
        kind: "day",
        key: `day:${group.date.toDateString()}`,
        title: formatRelativeDate(group.date, now, locale),
      },
      ...group.items.map((view) => ({
        kind: "row" as const,
        key: view.id,
        view,
      })),
    ]
  )

  return (
    <YStack flex={1} gap="3">
      {balance === null ? null : (
        <YStack items="flex-end">
          <Text fontWeight="600">
            {t("withdraw.history.balance", {
              amount: formatSatsAmount(balance, locale),
            })}
          </Text>
          <Text fontSize={12} color="muted-foreground">
            {fiat.approx(balance)}
          </Text>
        </YStack>
      )}
      <FlatList
        style={{ flex: 1 }}
        data={entries}
        keyExtractor={(entry) => entry.key}
        onEndReachedThreshold={0.5}
        onEndReached={() => {
          if (hasMore && !isPending) loadMore()
        }}
        ListEmptyComponent={<EmptyView message={t("withdraw.history.empty")} />}
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
            <WithdrawalRow view={item.view} />
          )
        }
      />
    </YStack>
  )
}

function WithdrawalRow({ view }: { readonly view: WithdrawalView }) {
  const { t } = useTranslation()
  const locale = useLocale()
  const amount = t("withdraw.sats", {
    amount: formatSatsAmount(view.amountSats, locale),
  })
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${amount}, ${shortWithdrawalDestination(view.target)}`}
      onPress={() =>
        router.push({
          pathname: "/withdraw/[withdrawalId]",
          params: { withdrawalId: view.id },
        })
      }
    >
      <YStack gap="1" py="3" px="3">
        <XStack justify="space-between" items="center" gap="2">
          <Text fontWeight="600">{amount}</Text>
          <WithdrawalStatusBadge view={view} />
        </XStack>
        <Text fontSize={12} numberOfLines={1}>
          {shortWithdrawalDestination(view.target)}
        </Text>
        {view.comment === null ? null : (
          <Text fontSize={12} color="muted-foreground" numberOfLines={1}>
            {view.comment}
          </Text>
        )}
        <Text fontSize={12} color="muted-foreground">
          {[
            t(withdrawalKindKeys[view.target.kind]),
            formatTime(new Date(view.createdAt), locale),
            view.deviceName,
          ]
            .filter((part) => part !== null)
            .join(" · ")}
        </Text>
      </YStack>
    </Pressable>
  )
}
