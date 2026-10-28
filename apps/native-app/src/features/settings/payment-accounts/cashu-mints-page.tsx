import { formatMintLabel } from "@payky/app-shared/cashu-withdraw-flow"
import { formatSatsAmount } from "@payky/app-shared/format-money"
import type { MintUrl } from "@payky/core/modules/cashu/cashu-types"
import { router } from "expo-router"
import Plus from "lucide-react-native/icons/plus"
import { Text, XStack, YStack } from "tamagui"
import { FadeHeader } from "../../../components/fade-header.tsx"
import { Screen } from "../../../components/screen.tsx"
import { Badge } from "../../../components/ui/badge.tsx"
import { Button } from "../../../components/ui/button.tsx"
import { VerticalNav } from "../../../components/vertical-nav.tsx"
import { useLocale, useTranslation } from "../../../hooks/use-translation.ts"
import { useCashuWallet } from "../../shared/cashu/use-cashu-wallet.ts"
import { getCashuMintSections } from "./cashu-mints-page-model.ts"

/** A row opening the mint's detail, where it is trusted or untrusted. */
const mintLink = (mint: MintUrl) => ({
  id: mint,
  kind: "link" as const,
  href: {
    pathname: "/settings/payment-accounts/cashu/mints/[mint]" as const,
    params: { mint },
  },
  accessibilityLabel: formatMintLabel(mint),
})

/**
 * The wallet's mints (cashu/0016), as web's `CashuMintsPage`: the trusted
 * ones with the default's badge, the mints not trusted that hold a balance,
 * then the presets as suggestions.
 */
export function CashuMintsPage() {
  const { t } = useTranslation()
  const locale = useLocale()
  const wallet = useCashuWallet()
  const { trusted, withBalance, suggested } = getCashuMintSections(
    wallet.trustedMints,
    wallet.balances
  )
  const balanceAction = (mint: MintUrl) => (
    <Text
      fontSize="xs"
      lineHeight="xs"
      color="muted-foreground"
      fontVariant={["tabular-nums"]}
    >
      {t("withdraw.sats", {
        amount: formatSatsAmount(wallet.balances.get(mint) ?? 0, locale),
      })}
    </Text>
  )

  return (
    <Screen>
      <FadeHeader title={t("settings.cashuMints.title")} />
      <YStack gap="4">
        <VerticalNav
          title={t("settings.cashuMints.trusted")}
          items={trusted.map((mint) => ({
            ...mintLink(mint),
            label: (
              // Not flex={1}: the row's label slot is a column, where it
              // would size the label to no height (settings-page.tsx).
              <XStack w="100%" items="center" gap="2">
                <Text flexShrink={1} numberOfLines={1}>
                  {formatMintLabel(mint)}
                </Text>
                {mint === wallet.defaultMint ? (
                  <Badge
                    variant="secondary"
                    label={t("settings.cashuMints.default")}
                  />
                ) : null}
              </XStack>
            ),
            action: balanceAction(mint),
          }))}
        />
        {withBalance.length === 0 ? null : (
          <VerticalNav
            title={t("settings.cashuMints.withBalance")}
            items={withBalance.map((mint) => ({
              ...mintLink(mint),
              label: <Text numberOfLines={1}>{formatMintLabel(mint)}</Text>,
              action: balanceAction(mint),
            }))}
          />
        )}
        {suggested.length === 0 ? null : (
          <VerticalNav
            title={t("settings.cashuMints.suggested")}
            items={suggested.map((mint) => ({
              ...mintLink(mint),
              label: <Text numberOfLines={1}>{formatMintLabel(mint)}</Text>,
              action: balanceAction(mint),
            }))}
          />
        )}
      </YStack>
      <Button
        size="lg"
        variant="outline"
        iconStart={Plus}
        label={t("settings.cashuMints.add")}
        onPress={() =>
          router.push("/settings/payment-accounts/cashu/mints/new")
        }
      />
    </Screen>
  )
}
