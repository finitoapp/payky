import { formatMintLabel } from "@payky/app-shared/cashu-withdraw-flow"
import type { MintUrl } from "@payky/core/modules/cashu/cashu-types"
import { PRODUCTION_MINTS } from "@payky/core/modules/cashu/cashu-utils"
import { Currency, Integer } from "@payky/core/modules/shared/schema"
import { Link } from "@tanstack/react-router"
import { PlusIcon } from "lucide-react"
import { FadeHeader } from "@/components/fade-header.tsx"
import { Badge } from "@/components/ui/badge.tsx"
import { Button } from "@/components/ui/button.tsx"
import { VerticalNav } from "@/components/vertical-nav.tsx"
import { useCashuWallet } from "@/features/shared/cashu/use-cashu-wallet.ts"
import { useLocale } from "@/hooks/use-locale.ts"
import { useTranslation } from "@/hooks/use-translation.ts"
import { formatMoney } from "@/lib/format-utils.ts"

/**
 * The wallet's mints (cashu/0016): the trusted ones, the default first with
 * its badge; the mints not trusted that still hold a balance; then the preset
 * mints as suggestions, each opening its detail to be trusted there.
 */
export function CashuMintsPage() {
  const { t } = useTranslation()
  const locale = useLocale()
  const wallet = useCashuWallet()
  const trusted = wallet.trustedMints
  const withBalance = [...wallet.balances]
    .filter(([mint, balance]) => balance > 0 && !trusted.includes(mint))
    .map(([mint]) => mint)
    .toSorted((a, b) => a.localeCompare(b))
  const suggestions = PRODUCTION_MINTS.filter(
    (mint) => !trusted.includes(mint) && !withBalance.includes(mint)
  )

  const row = (mint: MintUrl) => ({
    id: mint,
    kind: "link" as const,
    to: "/settings/payment-accounts/cashu/mints/$mint" as const,
    params: { mint },
    label: (
      <span className="flex min-w-0 flex-1 items-center gap-2">
        <span className="min-w-0 truncate">{formatMintLabel(mint)}</span>
        {mint === wallet.defaultMint ? (
          <Badge variant="secondary">{t("settings.cashuMints.default")}</Badge>
        ) : null}
      </span>
    ),
    action: (
      <span className="text-xs text-muted-foreground tabular-nums">
        {formatMoney(
          {
            value: Integer(wallet.balances.get(mint) ?? 0),
            currency: Currency.BTC,
          },
          locale
        )}
      </span>
    ),
  })

  return (
    <>
      <div className="h-6" />
      <FadeHeader title={t("settings.cashuMints.title")} />
      <div className="flex flex-col gap-4">
        <VerticalNav
          title={t("settings.cashuMints.trusted")}
          items={trusted.map(row)}
        />
        {withBalance.length > 0 ? (
          <VerticalNav
            title={t("settings.cashuMints.withBalance")}
            items={withBalance.map(row)}
          />
        ) : null}
        {suggestions.length > 0 ? (
          <VerticalNav
            title={t("settings.cashuMints.suggested")}
            items={suggestions.map(row)}
          />
        ) : null}
        <Button
          variant="outline"
          nativeButton={false}
          render={<Link to="/settings/payment-accounts/cashu/mints/new" />}
        >
          <PlusIcon />
          {t("settings.cashuMints.add")}
        </Button>
      </div>
    </>
  )
}
