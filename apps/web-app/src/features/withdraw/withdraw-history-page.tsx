import { groupByDay } from "@payky/app-shared/group-by-day"
import {
  shortWithdrawalDestination,
  withdrawalKindKeys,
} from "@payky/app-shared/withdraw-display"
import type { WithdrawMethod } from "@payky/app-shared/withdraw-flow"
import type { AccountId } from "@payky/core/modules/account/account-types"
import {
  toWithdrawalView,
  type WithdrawalView,
  withdrawalsByAccountQuery,
} from "@payky/core/modules/withdraw/withdraw-queries"
import { Link } from "@tanstack/react-router"
import { PlusIcon } from "lucide-react"
import { useCallback } from "react"
import { FadeHeader } from "@/components/fade-header.tsx"
import { ListSkeleton } from "@/components/list-skeleton.tsx"
import { Button } from "@/components/ui/button.tsx"
import { VerticalNav } from "@/components/vertical-nav.tsx"
import { useInfiniteEvoluQuery } from "@/hooks/use-infinite-evolu-query.ts"
import { useLocale } from "@/hooks/use-locale.ts"
import { useTranslation } from "@/hooks/use-translation.ts"
import {
  formatRelativeDate,
  formatSatsAmount,
  formatTime,
} from "@/lib/format-utils.ts"
import { useBtcFiat } from "./use-btc-fiat.ts"
import { useSparkBalance } from "./use-spark-balance.ts"
import {
  useCashuBalanceSats,
  useWithdrawAccountId,
  WithdrawNoAccountCard,
} from "./withdraw-account.tsx"
import { withdrawRoutes } from "./withdraw-display.ts"
import { WithdrawalStatusBadge } from "./withdraw-status-badge.tsx"

export function WithdrawHistoryPage({
  method,
}: {
  readonly method: WithdrawMethod
}) {
  const { t } = useTranslation()
  const accountId = useWithdrawAccountId(method)

  return (
    <>
      <div className="h-6" />
      <FadeHeader
        title={t(
          method === "spark" ? "withdraw.history.title" : "withdraw.cashu.title"
        )}
      />
      {accountId === undefined ? (
        <WithdrawNoAccountCard method={method} />
      ) : (
        <WithdrawHistory method={method} accountId={accountId} />
      )}
    </>
  )
}

function BalanceSummary({ balance }: { readonly balance: number | null }) {
  const { t } = useTranslation()
  const locale = useLocale()
  const fiat = useBtcFiat()
  if (balance === null) return null
  return (
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
  )
}

function SparkBalanceSummary({ accountId }: { readonly accountId: AccountId }) {
  return <BalanceSummary balance={useSparkBalance(accountId)} />
}

function CashuBalanceSummary() {
  return <BalanceSummary balance={useCashuBalanceSats()} />
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
          render={<Link to={withdrawRoutes[method].new} />}
        >
          <PlusIcon />
          {t("withdraw.history.new")}
        </Button>
        {method === "spark" ? (
          <SparkBalanceSummary accountId={accountId} />
        ) : (
          <CashuBalanceSummary />
        )}
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
            to: withdrawRoutes[method].detail,
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
                {withdrawal.comment !== null ? (
                  <span className="truncate text-xs text-muted-foreground">
                    {withdrawal.comment}
                  </span>
                ) : null}
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

      {method === "spark" ? (
        <p className="text-sm text-muted-foreground">
          {t("withdraw.history.olderNote")}{" "}
          <Link
            to="/settings/payment-accounts/spark/transactions"
            className="underline"
          >
            {t("withdraw.history.transactionsLink")}
          </Link>
        </p>
      ) : null}
    </div>
  )
}
