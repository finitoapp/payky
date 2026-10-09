import { Link } from "@tanstack/react-router"
import { PlusIcon } from "lucide-react"
import { useCallback } from "react"

import { FadeHeader } from "@/components/fade-header.tsx"
import { ListSkeleton } from "@/components/list-skeleton.tsx"
import { Button } from "@/components/ui/button.tsx"
import { VerticalNav } from "@/components/vertical-nav.tsx"
import { activeSparkAccountsQuery } from "@/core/modules/account/account-spark-queries.ts"
import type { AccountId } from "@/core/modules/account/account-types.ts"
import {
  toWithdrawalView,
  type WithdrawalView,
  withdrawalsByAccountQuery,
} from "@/core/modules/withdraw/withdraw-queries.ts"
import { useEvoluQuery } from "@/hooks/use-evolu-query.ts"
import { useInfiniteEvoluQuery } from "@/hooks/use-infinite-evolu-query.ts"
import { useLocale } from "@/hooks/use-locale.ts"
import { useTranslation } from "@/hooks/use-translation.ts"
import {
  formatRelativeDate,
  formatSatsAmount,
  formatTime,
} from "@/lib/format-utils.ts"
import { groupByDay } from "@/lib/group-by-day.ts"
import { useBtcFiat } from "./use-btc-fiat.ts"
import { useSparkBalance } from "./use-spark-balance.ts"
import {
  shortWithdrawalDestination,
  withdrawalKindKeys,
} from "./withdraw-display.ts"
import { WithdrawNoAccountCard } from "./withdraw-page.tsx"
import { WithdrawalStatusBadge } from "./withdraw-status-badge.tsx"

export function WithdrawHistoryPage() {
  const { t } = useTranslation()
  const { data: sparkAccountsData } = useEvoluQuery(activeSparkAccountsQuery)
  const [sparkAccount] = sparkAccountsData

  return (
    <>
      <div className="h-6" />
      <FadeHeader title={t("withdraw.history.title")} />
      {sparkAccount === undefined ? (
        <WithdrawNoAccountCard />
      ) : (
        <WithdrawHistory accountId={sparkAccount.id} />
      )}
    </>
  )
}

function WithdrawHistory({ accountId }: { readonly accountId: AccountId }) {
  const { t } = useTranslation()
  const locale = useLocale()
  const fiat = useBtcFiat()
  const balance = useSparkBalance(accountId)
  const createPageQuery = useCallback(
    (limit: number) => withdrawalsByAccountQuery(accountId, limit),
    [accountId]
  )
  const { rows, hasMore, isPending, sentinelRef } = useInfiniteEvoluQuery(
    [accountId],
    createPageQuery
  )
  const withdrawals = rows.flatMap((row): ReadonlyArray<WithdrawalView> => {
    const view = toWithdrawalView(row)
    return view === null ? [] : [view]
  })
  const now = new Date()
  const groups = groupByDay(
    withdrawals,
    (withdrawal) => new Date(withdrawal.createdAt)
  ).map((group) => ({
    title: formatRelativeDate(group.date, now, locale),
    items: group.items,
  }))

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <Button
          className="w-fit"
          nativeButton={false}
          render={
            <Link to="/settings/payment-accounts/spark/withdrawals/new" />
          }
        >
          <PlusIcon />
          {t("withdraw.history.new")}
        </Button>
        {balance !== null ? (
          <span className="flex flex-col items-end text-sm">
            <span className="font-medium">
              {t("withdraw.history.balance", {
                amount: formatSatsAmount(balance, locale),
              })}
            </span>
            <span className="text-xs text-muted-foreground">
              {fiat.approx(balance)}
            </span>
          </span>
        ) : null}
      </div>

      {groups.length === 0 ? (
        <VerticalNav
          items={[]}
          empty={
            <p className="p-4 text-sm text-muted-foreground">
              {t("withdraw.history.empty")}
            </p>
          }
        />
      ) : null}

      {groups.map((group) => (
        <VerticalNav
          key={group.title}
          title={group.title}
          items={group.items.map((withdrawal) => ({
            id: withdrawal.id,
            kind: "link",
            to: "/settings/payment-accounts/spark/withdrawals/$withdrawalId",
            params: { withdrawalId: withdrawal.id },
            label: (
              <span className="flex min-w-0 flex-col gap-1">
                <span className="flex items-center justify-between gap-2 text-sm">
                  <span className="font-semibold">
                    {t("withdraw.sats", {
                      amount: formatSatsAmount(withdrawal.amountSats, locale),
                    })}
                  </span>
                  <WithdrawalStatusBadge view={withdrawal} />
                </span>
                <span className="truncate font-mono text-xs">
                  {shortWithdrawalDestination(withdrawal.target)}
                </span>
                <span className="text-xs text-muted-foreground">
                  {[
                    t(withdrawalKindKeys[withdrawal.target.kind]),
                    formatTime(new Date(withdrawal.createdAt), locale),
                    withdrawal.deviceName,
                  ]
                    .filter((part) => part !== null)
                    .join(" · ")}
                </span>
              </span>
            ),
          }))}
        />
      ))}

      {hasMore && (
        <>
          {isPending && <ListSkeleton />}
          <div ref={sentinelRef} aria-hidden className="h-1" />
        </>
      )}

      <p className="text-sm text-muted-foreground">
        {t("withdraw.history.olderNote")}{" "}
        <Link
          to="/settings/payment-accounts/spark/transactions"
          className="underline"
        >
          {t("withdraw.history.transactionsLink")}
        </Link>
      </p>
    </div>
  )
}
