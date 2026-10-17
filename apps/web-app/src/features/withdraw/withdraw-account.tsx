import type { TranslationKey } from "@payky/app-shared/i18n/resources"
import { cashuAccountQuery } from "@payky/core/modules/account/account-queries"
import { activeSparkAccountsQuery } from "@payky/core/modules/account/account-spark-queries"
import type { AccountId } from "@payky/core/modules/account/account-types"
import { Link } from "@tanstack/react-router"
import { Button } from "@/components/ui/button.tsx"
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx"
import { useCashuWallet } from "@/features/shared/cashu/use-cashu-wallet.ts"
import { useEvoluQuery } from "@/hooks/use-evolu-query.ts"
import { useTranslation } from "@/hooks/use-translation.ts"
import type { WithdrawMethod } from "./withdraw-flow.ts"

/**
 * The account a method's withdrawals are booked to: the active Spark wallet,
 * or the Cashu account even while Cashu is off, since its ecash stays in the
 * wallet shared with Linky.
 */
export const useWithdrawAccountId = (
  method: WithdrawMethod
): AccountId | undefined => {
  const { data: spark } = useEvoluQuery(activeSparkAccountsQuery)
  const { data: cashu } = useEvoluQuery(cashuAccountQuery)
  return (method === "spark" ? spark[0] : cashu[0])?.id
}

/** The shared Cashu wallet's balance over all mints, `null` while it loads. */
export const useCashuBalanceSats = (): number | null => {
  const { snapshot } = useCashuWallet()
  return snapshot === null
    ? null
    : [...snapshot.balances.values()].reduce((sum, sats) => sum + sats, 0)
}

const noAccountKeys = {
  spark: {
    title: "withdraw.noAccount.title",
    description: "withdraw.noAccount.description",
  },
  cashu: {
    title: "withdraw.cashu.noAccount.title",
    description: "withdraw.cashu.noAccount.description",
  },
} satisfies Record<
  WithdrawMethod,
  { readonly title: TranslationKey; readonly description: TranslationKey }
>

export function WithdrawNoAccountCard({
  method,
}: {
  readonly method: WithdrawMethod
}) {
  const { t } = useTranslation()
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t(noAccountKeys[method].title)}</CardTitle>
        <CardDescription>
          {t(noAccountKeys[method].description)}
        </CardDescription>
      </CardHeader>
      <CardFooter>
        <Button
          className="w-fit"
          nativeButton={false}
          render={<Link to="/settings/payment-accounts" />}
        >
          {t("withdraw.noAccount.action")}
        </Button>
      </CardFooter>
    </Card>
  )
}
