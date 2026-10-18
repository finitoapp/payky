import { formatRelativeDate, formatTime } from "@payky/app-shared/format-date"
import { formatSatsAmount } from "@payky/app-shared/format-money"
import { groupByDay } from "@payky/app-shared/group-by-day"
import {
  shortWithdrawalDestination,
  withdrawalKindKeys,
  withdrawalMethod,
} from "@payky/app-shared/withdraw-display"
import type { WithdrawMethod } from "@payky/app-shared/withdraw-flow"
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
import { AppButton } from "../../components/app-button.tsx"
import { ScreenHeader } from "../../components/screen-header.tsx"
import { EmptyView, LoadingView } from "../../components/state-views.tsx"
import { useInfiniteEvoluQuery } from "../../hooks/use-infinite-evolu-query.ts"
import { useLocale, useTranslation } from "../../hooks/use-translation.ts"
import { useCashuWalletSnapshot } from "../shared/cashu/use-cashu-wallet-snapshot.ts"
import { useCashuAccountId } from "./use-cashu-withdraw-data.ts"
import {
  useBtcFiat,
  useSparkAccountId,
  useSparkBalance,
} from "./use-withdraw-data.ts"
import { WithdrawalStatusBadge } from "./withdraw-parts.tsx"
import { withdrawRoutes } from "./withdraw-routes.ts"

/** `/withdraw`: the Spark wallet's withdrawals, newest first. */
export function WithdrawHistoryPage() {
  return <WithdrawHistoryScreen method="spark" />
}

/** `/cashu-withdraw`: the withdrawals from the shared Cashu wallet. */
export function CashuWithdrawHistoryPage() {
  return <WithdrawHistoryScreen method="cashu" />
}

function WithdrawHistoryScreen({
  method,
}: {
  readonly method: WithdrawMethod
}) {
  const theme = useTheme()
  const { t } = useTranslation()

  return (
    <SafeAreaView
      style={{ flex: 1, padding: 16, backgroundColor: theme.background.val }}
    >
      <ScreenHeader
        title={t(
          method === "spark" ? "withdraw.history.title" : "withdraw.cashu.title"
        )}
      />
      <Suspense fallback={<LoadingView />}>
        <WithdrawHistoryBody method={method} />
      </Suspense>
    </SafeAreaView>
  )
}

function WithdrawHistoryBody({ method }: { readonly method: WithdrawMethod }) {
  const { t } = useTranslation()
  const sparkAccountId = useSparkAccountId()
  const cashuAccountId = useCashuAccountId()
  const accountId = method === "spark" ? sparkAccountId : cashuAccountId
  if (accountId === undefined) {
    return (
      <EmptyView
        message={
          method === "spark"
            ? `${t("withdraw.noAccount.title")}\n${t("withdraw.noAccount.description")}`
            : `${t("withdraw.cashu.noAccount.title")}\n${t("withdraw.cashu.noAccount.description")}`
        }
      />
    )
  }
  return <WithdrawHistory method={method} accountId={accountId} />
}

type ListEntry =
  | { readonly kind: "day"; readonly key: string; readonly title: string }
  | {
      readonly kind: "row"
      readonly key: string
      readonly view: WithdrawalView
    }

function SparkBalanceSummary({ accountId }: { readonly accountId: AccountId }) {
  return <BalanceSummary balance={useSparkBalance(accountId)} />
}

/** Its own `Suspense`: a Cashu wallet that is slow to start holds up only this line. */
function CashuBalanceSummary() {
  return (
    <Suspense fallback={null}>
      <CashuBalanceLine />
    </Suspense>
  )
}

function CashuBalanceLine() {
  const { snapshot } = useCashuWalletSnapshot()
  return (
    <BalanceSummary
      balance={
        snapshot === null
          ? null
          : [...snapshot.balances.values()].reduce((sum, sats) => sum + sats, 0)
      }
    />
  )
}

function BalanceSummary({ balance }: { readonly balance: number | null }) {
  const { t } = useTranslation()
  const locale = useLocale()
  const fiat = useBtcFiat()
  if (balance === null) return null
  return (
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
  )
}

function WithdrawHistory({
  method,
  accountId,
}: {
  readonly method: WithdrawMethod
  readonly accountId: AccountId
}) {
  const { t } = useTranslation()
  const locale = useLocale()
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
      <AppButton
        label={t("withdraw.history.new")}
        onPress={() => router.push(withdrawRoutes[method].new)}
      />
      {method === "spark" ? (
        <SparkBalanceSummary accountId={accountId} />
      ) : (
        <CashuBalanceSummary />
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
          pathname: withdrawRoutes[withdrawalMethod(view.target)].detail,
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
