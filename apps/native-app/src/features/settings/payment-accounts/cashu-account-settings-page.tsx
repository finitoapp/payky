import { formatSatsAmount } from "@payky/app-shared/format-money"
import { Suspense } from "react"
import { Text, XStack, YStack } from "tamagui"
import { FadeHeader } from "../../../components/fade-header.tsx"
import { Screen } from "../../../components/screen.tsx"
import { FailureView, LoadingView } from "../../../components/state-views.tsx"
import { useLocale, useTranslation } from "../../../hooks/use-translation.ts"
import { useCashuWalletSnapshot } from "../../shared/cashu/use-cashu-wallet-snapshot.ts"
import { SettingsRow } from "../settings-row.tsx"

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
  const { snapshot, isPending, isError, refetch } = useCashuWalletSnapshot()

  return (
    <Screen>
      <FadeHeader title={t("settings.cashuAccount.title")} />
      {isError ? (
        <FailureView
          messageKey="appError.description"
          onRetry={() => void refetch()}
        />
      ) : isPending || snapshot === null ? (
        <LoadingView />
      ) : (
        <YStack gap="4">
          <YStack
            gap="3"
            p="4"
            rounded="lg"
            borderWidth={1}
            borderColor="border-color"
          >
            <Text fontWeight="700">
              {t("settings.cashuAccount.wallet.title")}
            </Text>
            <Text color="muted-foreground">
              {t("settings.cashuAccount.wallet.description")}
            </Text>
            <YStack gap="1">
              <Text color="muted-foreground">
                {t("settings.cashuAccount.defaultMint")}
              </Text>
              <Text>{snapshot.defaultMint}</Text>
            </YStack>
            {!snapshot.hydrated ? (
              <Text color="muted-foreground">
                {t("settings.cashuAccount.syncing")}
              </Text>
            ) : snapshot.balances.size === 0 ? (
              <Text color="muted-foreground">
                {t("settings.cashuAccount.empty")}
              </Text>
            ) : (
              <YStack gap="2">
                {[...snapshot.balances].map(([mint, sats]) => (
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
          <SettingsRow
            title={t("settings.cashuAccount.mints")}
            value={t("settings.cashuAccount.mintsDescription")}
            href="/settings/payment-accounts/cashu/mints"
          />
          <SettingsRow
            title={t("settings.cashuAccount.withdraw")}
            value={t("settings.cashuAccount.withdrawDescription")}
            href="/cashu-withdraw"
          />
        </YStack>
      )}
    </Screen>
  )
}
