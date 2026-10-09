import { FadeHeader } from "@/components/fade-header.tsx"
import { VerticalNav } from "@/components/vertical-nav.tsx"
import { activeSparkAccountsQuery } from "@/core/modules/account/account-spark-queries.ts"
import type { AccountId } from "@/core/modules/account/account-types.ts"
import { accountTransactionsByAccountQuery } from "@/core/modules/account-transaction/account-transaction-queries.ts"
import type { AccountTransactionKind } from "@/core/modules/shared/schema.ts"
import { useEvoluQuery } from "@/hooks/use-evolu-query.ts"
import { useLocale } from "@/hooks/use-locale.ts"
import { useTranslation } from "@/hooks/use-translation.ts"
import type { TranslationKey } from "@/i18n/resources.ts"
import { formatDateTime, formatSatsAmount } from "@/lib/format-utils.ts"
import { cn } from "@/lib/utils.ts"

const kindKeys: Partial<Record<AccountTransactionKind, TranslationKey>> = {
  spark: "withdraw.transactions.kind.spark",
  onchain: "withdraw.kind.onchain",
}

/** The Spark account's transactions, read only. */
export function SparkTransactionsPage() {
  const { t } = useTranslation()
  const { data } = useEvoluQuery(activeSparkAccountsQuery)
  const [sparkAccount] = data

  return (
    <>
      <div className="h-6" />
      <FadeHeader title={t("withdraw.transactions.title")} />
      {sparkAccount === undefined ? null : (
        <SparkTransactions accountId={sparkAccount.id} />
      )}
    </>
  )
}

function SparkTransactions({ accountId }: { readonly accountId: AccountId }) {
  const { t } = useTranslation()
  const locale = useLocale()
  const { data } = useEvoluQuery(accountTransactionsByAccountQuery(accountId))

  return (
    <VerticalNav
      empty={
        <p className="p-4 text-sm text-muted-foreground">
          {t("withdraw.transactions.empty")}
        </p>
      }
      items={data.map((row) => {
        const kindKey = kindKeys[row.kind]
        return {
          id: row.id,
          kind: "static",
          label: (
            <span className="flex min-w-0 flex-col gap-1">
              <span className="flex items-center justify-between gap-2 text-sm">
                <span
                  className={cn(
                    "font-semibold tabular-nums",
                    row.amount > 0 && "text-success"
                  )}
                >
                  {row.amount > 0 ? "+" : "−"}
                  {t("withdraw.sats", {
                    amount: formatSatsAmount(Math.abs(row.amount), locale),
                  })}
                </span>
                <span className="text-xs text-muted-foreground">
                  {formatDateTime(new Date(row.occurredAt), locale)}
                </span>
              </span>
              <span className="text-xs text-muted-foreground">
                {[kindKey === undefined ? null : t(kindKey), row.note]
                  .filter((part) => part !== null)
                  .join(" · ")}
              </span>
            </span>
          ),
        }
      })}
    />
  )
}
