import { PRODUCTION_MINTS } from "@payky/core/cashu/cashu-mints"
import type { MintUrl } from "@payky/core/modules/cashu/cashu-types"
import { Currency, Integer } from "@payky/core/modules/shared/schema"
import { Link } from "@tanstack/react-router"
import { PlusIcon } from "lucide-react"
import { FadeHeader } from "@/components/fade-header.tsx"
import { Badge } from "@/components/ui/badge.tsx"
import { Button } from "@/components/ui/button.tsx"
import { VerticalNav } from "@/components/vertical-nav.tsx"
import { formatMintLabel } from "@/features/shared/cashu/cashu-mint-label.ts"
import { useCashuWallet } from "@/features/shared/cashu/use-cashu-wallet.ts"
import { useLocale } from "@/hooks/use-locale.ts"
import { useTranslation } from "@/hooks/use-translation.ts"
import { formatMoney } from "@/lib/format-utils.ts"

/**
 * The mints of the wallet shared with Linky (cashu.md §7): every known mint
 * with its balance and the default badge, then Linky's presets as
 * suggestions.
 */
export function CashuMintsPage() {
  const { t } = useTranslation()
  const locale = useLocale()
  const { snapshot } = useCashuWallet()
  const known = snapshot?.knownMints ?? []
  const defaultMint = snapshot?.defaultMint ?? null
  const listed: ReadonlyArray<MintUrl> = [
    ...new Set([...(defaultMint === null ? [] : [defaultMint]), ...known]),
  ]
  const suggestions = PRODUCTION_MINTS.filter((mint) => !listed.includes(mint))

  const row = (mint: MintUrl) => ({
    id: mint,
    kind: "link" as const,
    to: "/settings/payment-accounts/cashu/mints/$mint" as const,
    params: { mint },
    label: (
      <span className="flex min-w-0 flex-1 items-center gap-2">
        <span className="min-w-0 truncate">{formatMintLabel(mint)}</span>
        {mint === defaultMint ? (
          <Badge variant="secondary">{t("settings.cashuMints.default")}</Badge>
        ) : null}
      </span>
    ),
    action: (
      <span className="text-xs text-muted-foreground tabular-nums">
        {formatMoney(
          {
            value: Integer(snapshot?.balances.get(mint) ?? 0),
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
          title={t("settings.cashuMints.known")}
          items={listed.map(row)}
          empty={t("settings.cashuMints.empty")}
        />
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
