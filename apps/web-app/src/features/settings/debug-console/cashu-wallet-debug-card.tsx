import { cashuBalancesQuery } from "@payky/core/modules/cashu/cashu-queries"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx"
import { useEvoluQuery } from "@/hooks/use-evolu-query.ts"
import { useTranslation } from "@/hooks/use-translation.ts"

/**
 * Payky's Cashu wallet at a glance (cashu/0012): the balance per mint. A
 * development aid.
 */
export function CashuWalletDebugCard() {
  const { t } = useTranslation()
  const { data: balances } = useEvoluQuery(cashuBalancesQuery)

  return (
    <Card className="mt-8">
      <CardHeader>
        <CardTitle>{t("settings.debugConsole.cashu.title")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1 font-mono text-xs">
        {balances.length === 0 ? (
          <p>{t("settings.debugConsole.cashu.noBalance")}</p>
        ) : (
          balances.map((row) => (
            <p key={row.mintUrl}>
              {row.mintUrl}: {row.balance} sat
            </p>
          ))
        )}
      </CardContent>
    </Card>
  )
}
