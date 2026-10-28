import { cashuMintAddErrorKeys } from "@payky/app-shared/cashu-mint-errors"
import { formatMintLabel } from "@payky/app-shared/cashu-withdraw-flow"
import { formatSatsAmount } from "@payky/app-shared/format-money"
import type { TranslationKey } from "@payky/app-shared/i18n/resources"
import type { CashuMoveError } from "@payky/core/modules/cashu/cashu-errors"
import {
  setDefaultCashuMint,
  trustCashuMint,
  untrustCashuMint,
} from "@payky/core/modules/cashu/cashu-mint-actions"
import {
  type CashuMoveEstimate,
  estimateCashuMove,
  moveCashuFunds,
} from "@payky/core/modules/cashu/cashu-move-actions"
import type { MintUrl } from "@payky/core/modules/cashu/cashu-types"
import { normalizeMintUrl } from "@payky/core/modules/cashu/cashu-utils"
import { useQuery } from "@tanstack/react-query"
import { router, useLocalSearchParams } from "expo-router"
import { useAtomValue, useStore } from "jotai"
import ArrowRightLeft from "lucide-react-native/icons/arrow-right-left"
import ArrowUpFromLine from "lucide-react-native/icons/arrow-up-from-line"
import ShieldCheck from "lucide-react-native/icons/shield-check"
import ShieldOff from "lucide-react-native/icons/shield-off"
import Star from "lucide-react-native/icons/star"
import { Suspense, useRef, useState } from "react"
import { Image } from "react-native"
import { Text, XStack } from "tamagui"
import { accountAtom } from "../../../atoms/account.ts"
import { cashuWalletDepAtom } from "../../../atoms/cashu.ts"
import { evoluCounterAtom } from "../../../atoms/evolu-counter.ts"
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
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "../../../components/ui/field.tsx"
import { Input } from "../../../components/ui/input.tsx"
import { useAccess, useRequirePermission } from "../../../core/use-access.ts"
import { useConfirm } from "../../../hooks/use-confirm.ts"
import { useCashuRunToast } from "../../../hooks/use-run-toast.ts"
import { useLocale, useTranslation } from "../../../hooks/use-translation.ts"
import { fontSize } from "../../../theme/tokens.ts"
import { useCashuWallet } from "../../shared/cashu/use-cashu-wallet.ts"

const moveErrorKeys = {
  MintUnreachable: "settings.cashuMints.moveError.unreachable",
  MintRejected: "settings.cashuMints.moveError.rejected",
  CashuNothingToMove: "settings.cashuMints.moveError.nothing",
  CashuInsufficientFunds: "settings.cashuMints.moveError.insufficient",
  CashuMeltQuoteNotPayable: "settings.cashuMints.moveError.rejected",
  CashuMeltUnpaid: "settings.cashuMints.moveError.rejected",
  CashuMeltPending: "settings.cashuMints.moveError.pending",
  QuoteExpired: "settings.cashuMints.moveError.rejected",
  CounterLockTimeout: "settings.cashuMints.moveError.unreachable",
} satisfies Record<CashuMoveError["type"], TranslationKey>

/**
 * One mint, as web's `CashuMintDetailPage` (cashu/0016): info, balance,
 * whether Payky trusts it, the default's badge or "use for payments", moving
 * its funds to the default mint, withdrawing from a mint not trusted, and
 * trusting or untrusting it.
 */
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
  const wallet = useCashuWallet()
  const info = useQuery({
    queryKey: ["cashuMintInfo", account.id, mint],
    // A fetch that records nothing: looking at a mint does not add it.
    queryFn: async () => {
      const wallet = await walletDep.cashuWallet.loadFresh(mint)
      const mintInfo = wallet.getMintInfo()
      return { name: mintInfo.name, iconUrl: mintInfo.cache.icon_url ?? null }
    },
    retry: false,
  })

  const [trustErrorKey, setTrustErrorKey] = useState<TranslationKey | null>(
    null
  )

  const balance = wallet.balances.get(mint) ?? 0
  const { defaultMint } = wallet
  const isDefault = defaultMint === mint
  const isTrusted = wallet.trustedMints.includes(mint)
  const nextDefault = wallet.defaultWithout(mint)

  // Payky accepts tokens from a trusted mint (cashu/0016).
  const trust = async () => {
    if (!(await require("admin", "access.action.cashuMints"))) return
    setTrustErrorKey(null)
    await runToast(async (run) => {
      const trusted = await run(trustCashuMint(mint))
      if (!trusted.ok)
        setTrustErrorKey(cashuMintAddErrorKeys[trusted.error.type])
    })
  }

  // Where new Cashu payments go (cashu/0013), among the trusted mints.
  const setAsDefault = async () => {
    if (!(await require("admin", "access.action.cashuMints"))) return
    await runToast(async (run) => {
      const chosen = await run(setDefaultCashuMint(mint))
      if (!chosen.ok) return "settings.cashuMints.setDefaultError.untrusted"
    })
  }

  const untrust = async () => {
    if (!(await require("admin", "access.action.cashuMints"))) return
    const confirmed = await confirm({
      title: t("settings.cashuMints.untrustConfirm.title", {
        mint: formatMintLabel(mint),
      }),
      description:
        isDefault && nextDefault !== null
          ? t("settings.cashuMints.untrustConfirm.defaultDescription", {
              next: formatMintLabel(nextDefault),
            })
          : t("settings.cashuMints.untrustConfirm.description"),
      confirmLabel: t("settings.cashuMints.untrustConfirm.confirm"),
      cancelLabel: t("settings.cashuMints.untrustConfirm.cancel"),
      variant: "destructive",
    })
    if (!confirmed) return
    const untrusted = await runToast(async (run) => {
      // Core decides: it refuses only the last trusted mint.
      const result = await run(untrustCashuMint(mint))
      if (!result.ok) return "settings.cashuMints.untrustError.last"
    })
    if (untrusted) router.back()
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
        <CardContent gap={12}>
          <Text fontSize="sm" lineHeight="sm" color="muted-foreground">
            {isTrusted
              ? t("settings.cashuMints.trustDescription")
              : t("settings.cashuMints.notTrustedDescription")}
          </Text>
          {isTrusted ? null : (
            <Button
              variant="outline"
              iconStart={ShieldCheck}
              label={t("settings.cashuMints.trust")}
              onPress={() => void trust()}
            />
          )}
          {trustErrorKey === null ? null : (
            <Text fontSize="sm" lineHeight="sm" color="destructive">
              {t(trustErrorKey)}
            </Text>
          )}
          {isTrusted && !isDefault ? (
            <Button
              variant="outline"
              iconStart={Star}
              label={t("settings.cashuMints.setDefault")}
              disabled={info.isError}
              onPress={() => void setAsDefault()}
            />
          ) : null}
          {!isTrusted && balance > 0 ? (
            <Button
              variant="outline"
              iconStart={ArrowUpFromLine}
              label={t("settings.cashuMints.withdraw")}
              onPress={() =>
                router.push({
                  pathname: "/cashu-withdraw/new",
                  params: { mint },
                })
              }
            />
          ) : null}
        </CardContent>
      </Card>
      {!isDefault && balance > 0 ? (
        <MoveFundsCard sourceMint={mint} targetMint={defaultMint} />
      ) : null}
      {isTrusted && nextDefault !== null ? (
        <Button
          size="lg"
          variant="ghost"
          iconStart={ShieldOff}
          label={t("settings.cashuMints.untrust")}
          onPress={() => void untrust()}
        />
      ) : null}
    </Screen>
  )
}

/**
 * Web's move-funds card: a move from `sourceMint` to the default mint
 * (cashu/0016), priced first, then run behind the PIN (access/0009).
 * The move is re-checked against the account it was priced for, and a failed
 * run drops the estimate, so a repeat always starts from a fresh price over
 * the balance as it now stands; the Cashu job resumes an interrupted one.
 */
function MoveFundsCard({
  sourceMint,
  targetMint,
}: {
  readonly sourceMint: MintUrl
  readonly targetMint: MintUrl
}) {
  const { t } = useTranslation()
  const locale = useLocale()
  const runToast = useCashuRunToast()
  const access = useAccess()
  const { require, requirePin } = useRequirePermission()
  const jotaiStore = useStore()
  const [amount, setAmount] = useState("")
  const [estimate, setEstimate] = useState<CashuMoveEstimate | null>(null)
  const [moveErrorKey, setMoveErrorKey] = useState<TranslationKey | null>(null)
  const [pending, setPending] = useState(false)
  // `pending` lags a render behind: a second tap must not move twice.
  const movingRef = useRef(false)

  const sats = (value: number) =>
    t("withdraw.sats", { amount: formatSatsAmount(value, locale) })
  const parsedAmount = amount.trim() === "" ? undefined : Number(amount)
  const amountValid =
    parsedAmount === undefined ||
    (Number.isInteger(parsedAmount) && parsedAmount > 0)
  const moveInput = {
    sourceMint,
    targetMint,
    ...(parsedAmount === undefined ? {} : { amount: parsedAmount }),
  }

  const estimateMove = async () => {
    setPending(true)
    setMoveErrorKey(null)
    await runToast(async (run) => {
      const result = await run(estimateCashuMove(moveInput))
      if (result.ok) setEstimate(result.value)
      else setMoveErrorKey(moveErrorKeys[result.error.type])
    })
    setPending(false)
  }

  const move = async () => {
    if (estimate === null || movingRef.current) return
    movingRef.current = true
    try {
      const accountVersion = jotaiStore.get(evoluCounterAtom)
      // Moving money out of a mint always asks for the PIN (access/0009).
      const detail = t("settings.cashuMints.movePinDetail", {
        amount: sats(estimate.amount),
        mint: formatMintLabel(targetMint),
      })
      const allowed = access.enabled
        ? await requirePin("access.action.moveCashuFunds", detail)
        : await require("admin", "access.action.moveCashuFunds")
      if (!allowed) return
      // A switch while the PIN was asked for leaves this card's account.
      if (jotaiStore.get(evoluCounterAtom) !== accountVersion) return
      setPending(true)
      setMoveErrorKey(null)
      await runToast(async (run) => {
        const result = await run(moveCashuFunds(moveInput))
        if (!result.ok) {
          setMoveErrorKey(moveErrorKeys[result.error.type])
          return
        }
        setAmount("")
      })
      // Whatever happened, the next move starts from a fresh price.
      setEstimate(null)
    } finally {
      setPending(false)
      movingRef.current = false
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.cashuMints.move.title")}</CardTitle>
        <CardDescription>
          {t("settings.cashuMints.move.description", {
            mint: formatMintLabel(targetMint),
          })}
        </CardDescription>
      </CardHeader>
      <CardContent gap={12}>
        <Field>
          <FieldLabel>{t("settings.cashuMints.move.amount")}</FieldLabel>
          <Input
            aria-label={t("settings.cashuMints.move.amount")}
            keyboardType="number-pad"
            value={amount}
            invalid={!amountValid}
            disabled={pending}
            onChangeText={(next) => {
              setAmount(next)
              setEstimate(null)
            }}
          />
          <FieldDescription>
            {t("settings.cashuMints.move.amountDescription")}
          </FieldDescription>
          <FieldError>
            {moveErrorKey === null ? undefined : t(moveErrorKey)}
          </FieldError>
        </Field>
        {estimate === null ? (
          <Button
            variant="outline"
            label={t("settings.cashuMints.move.estimate")}
            disabled={pending || !amountValid}
            onPress={() => void estimateMove()}
          />
        ) : (
          <>
            <Text fontSize={fontSize.sm} lineHeight={fontSize.sm}>
              {t("settings.cashuMints.move.estimateResult", {
                amount: sats(estimate.amount),
                total: sats(estimate.totalFromSource),
              })}
            </Text>
            <Button
              iconStart={ArrowRightLeft}
              label={t("settings.cashuMints.move.confirm")}
              pending={pending}
              onPress={() => void move()}
            />
          </>
        )}
      </CardContent>
    </Card>
  )
}
