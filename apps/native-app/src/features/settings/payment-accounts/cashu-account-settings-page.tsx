import { formatSatsAmount } from "@payky/app-shared/format-money"
import ArrowUpFromLine from "lucide-react-native/icons/arrow-up-from-line"
import Coins from "lucide-react-native/icons/coins"
import Landmark from "lucide-react-native/icons/landmark"
import { Suspense } from "react"
import { Text, XStack, YStack } from "tamagui"
import { FadeHeader } from "../../../components/fade-header.tsx"
import { LoadingView } from "../../../components/loading-view.tsx"
import { Screen } from "../../../components/screen.tsx"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../../components/ui/card.tsx"
import { Icon } from "../../../components/ui/icon.tsx"
import { VerticalNav } from "../../../components/vertical-nav.tsx"
import { useLocale, useTranslation } from "../../../hooks/use-translation.ts"
import { useCashuWallet } from "../../shared/cashu/use-cashu-wallet.ts"

export function CashuAccountSettingsPage() {
  return (
    <Suspense fallback={<LoadingView />}>
      <CashuAccountSettingsContent />
    </Suspense>
  )
}

function CashuAccountSettingsContent() {
  const { t } = useTranslation()
  const locale = useLocale()
  const wallet = useCashuWallet()

  return (
    <Screen>
      <FadeHeader title={t("settings.cashuAccount.title")} />
      <YStack gap="4">
        <Card>
          <CardHeader>
            <XStack items="center" gap="2">
              <Icon icon={Coins} color="muted-foreground" size={20} />
              <CardTitle>{t("settings.cashuAccount.wallet.title")}</CardTitle>
            </XStack>
            <CardDescription>
              {t("settings.cashuAccount.wallet.description")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <YStack gap="3">
              <YStack gap="1">
                <Text fontSize={13} color="muted-foreground">
                  {t("settings.cashuAccount.defaultMint")}
                </Text>
                <Text fontWeight="500" flexWrap="wrap">
                  {wallet.defaultMint}
                </Text>
              </YStack>
              {wallet.balances.size === 0 ? (
                <Text color="muted-foreground">
                  {t("settings.cashuAccount.empty")}
                </Text>
              ) : (
                <YStack gap="1">
                  {[...wallet.balances].map(([mint, sats]) => (
                    <XStack key={mint} gap="3" justify="space-between">
                      <Text flex={1} flexShrink={1}>
                        {mint}
                      </Text>
                      <Text fontVariant={["tabular-nums"]}>
                        {t("withdraw.sats", {
                          amount: formatSatsAmount(sats, locale),
                        })}
                      </Text>
                    </XStack>
                  ))}
                </YStack>
              )}
            </YStack>
          </CardContent>
        </Card>
        <VerticalNav
          items={[
            {
              kind: "link",
              href: "/settings/payment-accounts/cashu/mints",
              icon: <Icon icon={Landmark} color="muted-foreground" />,
              label: (
                <YStack gap="1">
                  <Text fontSize="sm" lineHeight="sm" fontWeight="600">
                    {t("settings.cashuAccount.mints")}
                  </Text>
                  <Text fontSize={13} color="muted-foreground">
                    {t("settings.cashuAccount.mintsDescription")}
                  </Text>
                </YStack>
              ),
            },
            {
              kind: "link",
              href: "/cashu-withdraw",
              icon: <Icon icon={ArrowUpFromLine} color="muted-foreground" />,
              label: (
                <YStack gap="1">
                  <Text fontSize="sm" lineHeight="sm" fontWeight="600">
                    {t("settings.cashuAccount.withdraw")}
                  </Text>
                  <Text fontSize={13} color="muted-foreground">
                    {t("settings.cashuAccount.withdrawDescription")}
                  </Text>
                </YStack>
              ),
            },
          ]}
        />
      </YStack>
    </Screen>
  )
}
