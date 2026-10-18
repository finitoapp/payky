import { formatMintLabel } from "@payky/app-shared/cashu-withdraw-flow"
import { formatSatsAmount } from "@payky/app-shared/format-money"
import { router } from "expo-router"
import type { ReactNode } from "react"
import { Text, XStack, YStack } from "tamagui"
import { AppButton } from "../../../components/app-button.tsx"
import { Screen } from "../../../components/screen.tsx"
import { ScreenHeader } from "../../../components/screen-header.tsx"
import { FailureView, LoadingView } from "../../../components/state-views.tsx"
import { useLocale, useTranslation } from "../../../hooks/use-translation.ts"
import { useCashuKnownMints } from "../../shared/cashu/use-cashu-known-mints.ts"
import { useCashuWalletSnapshot } from "../../shared/cashu/use-cashu-wallet-snapshot.ts"
import { getCashuMintSections } from "./cashu-mints-page-model.ts"

export function CashuMintsPage() {
  const { t } = useTranslation()
  const locale = useLocale()
  const wallet = useCashuWalletSnapshot()
  const mints = useCashuKnownMints()
  const snapshot = wallet.snapshot

  if (wallet.isError || mints.isError) {
    return (
      <FailureView
        messageKey="appError.description"
        onRetry={() => {
          void wallet.refetch()
          void mints.refetch()
        }}
      />
    )
  }
  if (wallet.isPending || snapshot === null || mints.isPending)
    return <LoadingView />

  const { known, suggested } = getCashuMintSections(
    snapshot.defaultMint,
    mints.data
  )

  return (
    <Screen>
      <ScreenHeader title={t("settings.cashuMints.title")} />
      {!snapshot.hydrated ? (
        <Text color="muted-foreground">
          {t("settings.cashuAccount.syncing")}
        </Text>
      ) : null}
      <MintSection title={t("settings.cashuMints.known")}>
        {known.length === 0 && snapshot.hydrated ? (
          <Text color="muted-foreground">{t("settings.cashuMints.empty")}</Text>
        ) : (
          known.map((mint) => (
            <MintRow
              key={mint}
              mint={mint}
              isDefault={mint === snapshot.defaultMint}
              balance={
                snapshot.hydrated ? (snapshot.balances.get(mint) ?? 0) : null
              }
              locale={locale}
            />
          ))
        )}
      </MintSection>
      {suggested.length === 0 ? null : (
        <MintSection title={t("settings.cashuMints.suggested")}>
          {suggested.map((mint) => (
            <MintRow key={mint} mint={mint} locale={locale} />
          ))}
        </MintSection>
      )}
      <AppButton
        variant="secondary"
        label={t("settings.cashuMints.add")}
        onPress={() =>
          router.push("/settings/payment-accounts/cashu/mints/new")
        }
      />
    </Screen>
  )
}

function MintSection({
  title,
  children,
}: {
  readonly title: string
  readonly children: ReactNode
}) {
  return (
    <YStack gap="2">
      <Text fontWeight="700">{title}</Text>
      {children}
    </YStack>
  )
}

function MintRow({
  mint,
  isDefault = false,
  balance,
  locale,
}: {
  readonly mint: string
  readonly isDefault?: boolean
  readonly balance?: number | null
  readonly locale: string
}) {
  const { t } = useTranslation()
  return (
    <XStack
      items="center"
      gap="3"
      p="3"
      rounded="lg"
      borderWidth={1}
      borderColor="border-color"
      accessibilityRole="button"
      accessibilityLabel={formatMintLabel(mint)}
      onPress={() =>
        router.push({
          pathname: "/settings/payment-accounts/cashu/mints/[mint]",
          params: { mint },
        })
      }
    >
      <YStack flex={1} gap="1">
        <Text>{formatMintLabel(mint)}</Text>
        {isDefault ? (
          <Text color="muted-foreground" fontSize={13}>
            {t("settings.cashuMints.default")}
          </Text>
        ) : null}
      </YStack>
      {balance === null || balance === undefined ? null : (
        <Text fontVariant={["tabular-nums"]}>
          {t("withdraw.sats", {
            amount: formatSatsAmount(balance, locale),
          })}
        </Text>
      )}
    </XStack>
  )
}
