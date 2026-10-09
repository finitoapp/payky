import { useQuery } from "@tanstack/react-query"

import { activeSparkAccountByIdQuery } from "@/core/modules/account/account-spark-queries.ts"
import type { AccountId } from "@/core/modules/account/account-types.ts"
import { useAppRun } from "@/hooks/use-app-run.ts"
import { useEvoluQuery } from "@/hooks/use-evolu-query.ts"

/**
 * The spendable balance in sats of the Spark wallet `accountId` names, `null`
 * while it loads or when that account is gone. One query key per account for
 * every withdrawal screen, so moving between them reuses the answer.
 */
export function useSparkBalance(accountId: AccountId): number | null {
  const appRun = useAppRun()
  const { data } = useEvoluQuery(activeSparkAccountByIdQuery(accountId))
  const [sparkAccount] = data
  const balanceQuery = useQuery({
    queryKey: ["withdraw", "spark-balance", accountId],
    queryFn: async () => {
      if (sparkAccount === undefined) return null
      await using run = appRun()
      await using wallet = await run.deps.sparkWallet.create(
        sparkAccount.secret
      )
      return (await wallet.getBalance()).availableSats
    },
    enabled: sparkAccount !== undefined,
  })
  return balanceQuery.data ?? null
}
