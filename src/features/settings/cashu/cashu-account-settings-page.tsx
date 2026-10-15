import { ArrowUpFromLine, CoinsIcon, LandmarkIcon } from "lucide-react"

import { FadeHeader } from "@/components/fade-header.tsx"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx"
import { VerticalNav } from "@/components/vertical-nav.tsx"
import { Currency, Integer } from "@/core/modules/shared/schema.ts"
import { useCashuWallet } from "@/features/shared/cashu/use-cashu-wallet.ts"
import { useLocale } from "@/hooks/use-locale.ts"
import { useTranslation } from "@/hooks/use-translation.ts"
import { formatMoney } from "@/lib/format-utils.ts"

/**
 * The Cashu payment method (cashu.md §4): the wallet it shares with Linky,
 * its default mint, and what each mint holds.
 */
export function CashuAccountSettingsPage() {
  const { t } = useTranslation()
  const locale = useLocale()
  const { snapshot } = useCashuWallet()
  const balances = snapshot === null ? [] : [...snapshot.balances]

  return (
    <>
      <div className="h-6" />
      <FadeHeader title={t("settings.cashuAccount.title")} />
      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CoinsIcon className="size-5 text-muted-foreground" />
              {t("settings.cashuAccount.wallet.title")}
            </CardTitle>
            <CardDescription>
              {t("settings.cashuAccount.wallet.description")}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            <div className="flex flex-col gap-1">
              <span className="text-muted-foreground">
                {t("settings.cashuAccount.defaultMint")}
              </span>
              <span className="font-medium break-all">
                {snapshot?.defaultMint ?? " "}
              </span>
            </div>
            {snapshot !== null && !snapshot.hydrated ? (
              <p className="text-muted-foreground">
                {t("settings.cashuAccount.syncing")}
              </p>
            ) : balances.length === 0 ? (
              <p className="text-muted-foreground">
                {t("settings.cashuAccount.empty")}
              </p>
            ) : (
              <ul className="flex flex-col gap-1">
                {balances.map(([mint, sats]) => (
                  <li key={mint} className="flex justify-between gap-3">
                    <span className="min-w-0 truncate">{mint}</span>
                    <span className="tabular-nums">
                      {formatMoney(
                        { value: Integer(sats), currency: Currency.BTC },
                        locale
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <VerticalNav
          items={[
            {
              kind: "link",
              to: "/settings/payment-accounts/cashu/mints",
              icon: <LandmarkIcon className="text-muted-foreground" />,
              label: (
                <span className="flex flex-col gap-1">
                  <span className="text-sm font-semibold">
                    {t("settings.cashuAccount.mints")}
                  </span>
                  <span className="text-xs leading-snug text-muted-foreground">
                    {t("settings.cashuAccount.mintsDescription")}
                  </span>
                </span>
              ),
            },
            {
              kind: "link",
              to: "/settings/payment-accounts/cashu/withdrawals",
              icon: <ArrowUpFromLine className="text-muted-foreground" />,
              label: (
                <span className="flex flex-col gap-1">
                  <span className="text-sm font-semibold">
                    {t("settings.cashuAccount.withdraw")}
                  </span>
                  <span className="text-xs leading-snug text-muted-foreground">
                    {t("settings.cashuAccount.withdrawDescription")}
                  </span>
                </span>
              ),
            },
          ]}
        />
      </div>
    </>
  )
}
