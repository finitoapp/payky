import { formatMintLabel } from "@payky/app-shared/cashu-withdraw-flow"
import { formatSatsAmount } from "@payky/app-shared/format-money"
import { removeKnownCashuMint } from "@payky/core/cashu/cashu-mints"
import type { MintUrl } from "@payky/core/modules/cashu/cashu-types"
import { normalizeMintUrl } from "@payky/core/modules/cashu/cashu-utils"
import { useQuery } from "@tanstack/react-query"
import { router, useLocalSearchParams } from "expo-router"
import { useAtomValue } from "jotai"
import Trash2 from "lucide-react-native/icons/trash"
import { Suspense } from "react"
import { Image } from "react-native"
import { Text, XStack } from "tamagui"
import { accountAtom } from "../../../atoms/account.ts"
import { cashuWalletDepAtom } from "../../../atoms/cashu.ts"
import { FadeHeader } from "../../../components/fade-header.tsx"
import { LoadingView } from "../../../components/loading-view.tsx"
import { RouteMessage } from "../../../components/route-message.tsx"
import { Screen } from "../../../components/screen.tsx"
import { Badge } from "../../../components/ui/badge.tsx"
import { Button } from "../../../components/ui/button.tsx"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../../components/ui/card.tsx"
import { useRequirePermission } from "../../../core/use-access.ts"
import { useConfirm } from "../../../hooks/use-confirm.ts"
import { useCashuRunToast } from "../../../hooks/use-run-toast.ts"
import { useLocale, useTranslation } from "../../../hooks/use-translation.ts"
import { useCashuWalletSnapshot } from "../../shared/cashu/use-cashu-wallet-snapshot.ts"

/** One mint, as web's `CashuMintDetailPage`: info, balance, default badge and removal. */
export function CashuMintDetailPage() {
  const { t } = useTranslation()
  const { mint } = useLocalSearchParams<{ mint: string }>()
  const parsed = normalizeMintUrl(mint ?? "")
  if (parsed === null) {
    return <RouteMessage>{t("settings.cashuMints.invalid")}</RouteMessage>
  }
  return (
    <Suspense fallback={<LoadingView />}>
      <CashuMintDetail mint={parsed} />
    </Suspense>
  )
}

function CashuMintDetail({ mint }: { readonly mint: MintUrl }) {
  const { t } = useTranslation()
  const locale = useLocale()
  const runToast = useCashuRunToast()
  const confirm = useConfirm()
  const { require } = useRequirePermission()
  const account = useAtomValue(accountAtom)
  const walletDep = useAtomValue(cashuWalletDepAtom)
  const { snapshot } = useCashuWalletSnapshot()
  const info = useQuery({
    queryKey: ["cashuMintInfo", account.id, mint],
    // A fetch that records nothing: the mint is not marked seen by looking.
    queryFn: async () => {
      const wallet = await walletDep.cashuWallet.loadFresh(mint)
      const mintInfo = wallet.getMintInfo()
      return { name: mintInfo.name, iconUrl: mintInfo.cache.icon_url ?? null }
    },
    retry: false,
  })

  const balance = snapshot?.balances.get(mint) ?? 0
  const isDefault = snapshot?.defaultMint === mint

  const remove = async () => {
    if (!(await require("admin", "access.action.cashuMints"))) return
    const confirmed = await confirm({
      title: t("settings.cashuMints.remove"),
      description: formatMintLabel(mint),
      confirmLabel: t("settings.cashuMints.remove"),
      cancelLabel: t("access.cancel"),
      variant: "destructive",
    })
    if (!confirmed) return
    const removed = await runToast(async (run) => {
      // Core decides: it refuses while an unspent proof or a pending receive names the mint.
      const result = await run(removeKnownCashuMint(mint))
      if (!result.ok) return "settings.cashuMints.removeError.inUse"
    })
    if (removed) router.back()
  }

  return (
    <Screen>
      <FadeHeader title={info.data?.name ?? formatMintLabel(mint)} />
      <Card>
        <CardHeader>
          <XStack items="center" gap="2">
            {info.data?.iconUrl ? (
              <Image
                source={{ uri: info.data.iconUrl }}
                accessibilityIgnoresInvertColors
                style={{ width: 24, height: 24, borderRadius: 12 }}
              />
            ) : null}
            <CardTitle flex={1} flexWrap="wrap">
              {formatMintLabel(mint)}
            </CardTitle>
            {isDefault ? (
              <Badge
                variant="secondary"
                label={t("settings.cashuMints.default")}
              />
            ) : null}
          </XStack>
          <CardDescription>
            {info.isError
              ? t("settings.cashuMints.infoUnavailable")
              : t("settings.cashuMints.balance", {
                  amount: t("withdraw.sats", {
                    amount: formatSatsAmount(balance, locale),
                  }),
                })}
          </CardDescription>
        </CardHeader>
        {isDefault ? null : (
          <CardContent>
            <Text color="muted-foreground">
              {t("settings.cashuMints.defaultWarning")}
            </Text>
          </CardContent>
        )}
      </Card>
      {isDefault ? null : (
        <Button
          size="lg"
          variant="ghost"
          iconStart={Trash2}
          label={t("settings.cashuMints.remove")}
          onPress={() => void remove()}
        />
      )}
    </Screen>
  )
}
