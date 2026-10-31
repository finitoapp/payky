import {
  cashuMintAddErrorKeys,
  cashuSetDefaultMintErrorKeys,
  cashuUntrustMintErrorKeys,
} from "@payky/app-shared/cashu-mint-errors"
import { formatMintLabel } from "@payky/app-shared/cashu-withdraw-flow"
import type { TranslationKey } from "@payky/app-shared/i18n/resources"
import { missingCashuNuts } from "@payky/core/cashu/cashu-wallet"
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
import { Currency, Integer } from "@payky/core/modules/shared/schema"
import { useQuery } from "@tanstack/react-query"
import { Link, useNavigate } from "@tanstack/react-router"
import { useAtomValue, useStore } from "jotai"
import {
  ArrowRightLeftIcon,
  ArrowUpFromLineIcon,
  ShieldCheckIcon,
  ShieldOffIcon,
  StarIcon,
} from "lucide-react"
import { useState } from "react"
import { accountAtom } from "@/atoms/account.ts"
import { cashuWalletDepAtom } from "@/atoms/cashu.ts"
import { FadeHeader } from "@/components/fade-header.tsx"
import { RouteMessage } from "@/components/route-message.tsx"
import { Badge } from "@/components/ui/badge.tsx"
import { Button } from "@/components/ui/button.tsx"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field.tsx"
import { Input } from "@/components/ui/input.tsx"
import { useCashuWallet } from "@/features/shared/cashu/use-cashu-wallet.ts"
import { useAccess, useRequirePermission } from "@/hooks/use-access.ts"
import { useConfirmDialog } from "@/hooks/use-confirm-dialog.ts"
import { useLocale } from "@/hooks/use-locale.ts"
import { useCashuRunToast } from "@/hooks/use-run-toast.ts"
import { useTranslation } from "@/hooks/use-translation.ts"
import { formatMoney } from "@/lib/format-utils.ts"

const moveErrorKeys = {
  MintUnreachable: "settings.cashuMints.moveError.unreachable",
  MintRejected: "settings.cashuMints.moveError.rejected",
  CashuMintUnsupported: "settings.cashuMints.moveError.unsupported",
  CashuNothingToMove: "settings.cashuMints.moveError.nothing",
  CashuMoveCostRose: "settings.cashuMints.moveError.costRose",
  CashuInsufficientFunds: "settings.cashuMints.moveError.insufficient",
  CashuMeltQuoteNotPayable: "settings.cashuMints.moveError.rejected",
  CashuMeltUnpaid: "settings.cashuMints.moveError.rejected",
  CashuMeltPending: "settings.cashuMints.moveError.pending",
  QuoteExpired: "settings.cashuMints.moveError.rejected",
  CounterLockTimeout: "settings.cashuMints.moveError.unreachable",
  CashuReclaimAmbiguous: "settings.cashuMints.moveError.pending",
} satisfies Record<CashuMoveError["type"], TranslationKey>

export function CashuMintDetailPage({ mint }: { readonly mint: string }) {
  const { t } = useTranslation()
  const parsed = normalizeMintUrl(mint)
  if (parsed === null)
    return <RouteMessage>{t("settings.cashuMints.invalid")}</RouteMessage>
  return <CashuMintDetail mint={parsed} />
}

function CashuMintDetail({ mint }: { readonly mint: MintUrl }) {
  const { t } = useTranslation()
  const locale = useLocale()
  const navigate = useNavigate()
  const runToast = useCashuRunToast()
  const access = useAccess()
  const { require, requirePin } = useRequirePermission()
  const wallet = useCashuWallet()
  const confirm = useConfirmDialog()
  const account = useAtomValue(accountAtom)
  const jotaiStore = useStore()
  const info = useQuery({
    queryKey: ["cashuMintInfo", account.id, mint],
    // A fetch that records nothing: looking at a mint does not add it. The
    // wallet is read here, not in render: one that fails to load fails
    // this query, and the balance and trust controls still show.
    queryFn: async () => {
      const walletDep = await jotaiStore.get(cashuWalletDepAtom)
      const wallet = await walletDep.cashuWallet.loadFresh(mint)
      const mintInfo = wallet.getMintInfo()
      return {
        name: mintInfo.name,
        iconUrl: mintInfo.cache.icon_url ?? null,
        // What Payky's wallet stands on and the mint does not list
        // (cashu/0033).
        unsupported: missingCashuNuts(mintInfo).length > 0,
      }
    },
    retry: false,
  })
  const [amount, setAmount] = useState("")
  const [estimate, setEstimate] = useState<CashuMoveEstimate | null>(null)
  const [moveErrorKey, setMoveErrorKey] = useState<TranslationKey | null>(null)
  const [pending, setPending] = useState(false)

  const [trustErrorKey, setTrustErrorKey] = useState<TranslationKey | null>(
    null
  )

  const balance = wallet.balances.get(mint) ?? 0
  const { defaultMint } = wallet
  const isDefault = defaultMint === mint
  const isTrusted = wallet.trustedMints.includes(mint)
  const nextDefault = wallet.defaultWithout(mint)
  const sats = (value: number) =>
    formatMoney({ value: Integer(value), currency: Currency.BTC }, locale)
  const parsedAmount = amount.trim() === "" ? undefined : Number(amount)
  const amountValid =
    parsedAmount === undefined ||
    (Number.isInteger(parsedAmount) && parsedAmount > 0)

  const trust = async () => {
    if (!(await require("admin", "access.action.cashuMints"))) return
    setTrustErrorKey(null)
    await runToast(async (run) => {
      const trusted = await run(trustCashuMint(mint))
      if (!trusted.ok)
        setTrustErrorKey(cashuMintAddErrorKeys[trusted.error.type])
    })
  }

  const setAsDefault = async () => {
    if (!(await require("admin", "access.action.cashuMints"))) return
    await runToast(async (run) => {
      const chosen = await run(setDefaultCashuMint(mint))
      if (!chosen.ok) return cashuSetDefaultMintErrorKeys[chosen.error.type]
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
    await runToast(async (run) => {
      const untrusted = await run(untrustCashuMint(mint))
      if (!untrusted.ok) return cashuUntrustMintErrorKeys[untrusted.error.type]
      await navigate({ to: "/settings/payment-accounts/cashu/mints" })
    })
  }

  const estimateMove = async () => {
    if (defaultMint === null) return
    setPending(true)
    setMoveErrorKey(null)
    await runToast(async (run) => {
      const result = await run(
        estimateCashuMove({
          sourceMint: mint,
          targetMint: defaultMint,
          ...(parsedAmount === undefined ? {} : { amount: parsedAmount }),
        })
      )
      if (result.ok) setEstimate(result.value)
      else setMoveErrorKey(moveErrorKeys[result.error.type])
    })
    setPending(false)
  }

  const move = async () => {
    if (estimate === null || defaultMint === null) return
    // Moving money out of a mint always asks for the PIN (access/0009).
    const detail = t("settings.cashuMints.movePinDetail", {
      amount: sats(estimate.amount),
      mint: formatMintLabel(defaultMint),
    })
    const allowed = access.enabled
      ? await requirePin("access.action.moveCashuFunds", detail)
      : await require("admin", "access.action.moveCashuFunds")
    if (!allowed) return
    setPending(true)
    await runToast(async (run) => {
      const result = await run(
        moveCashuFunds({
          sourceMint: mint,
          targetMint: defaultMint,
          ...(parsedAmount === undefined ? {} : { amount: parsedAmount }),
          // Never more than the merchant confirmed (cashu/0023).
          maxTotal: estimate.totalFromSource,
        })
      )
      if (!result.ok) {
        setMoveErrorKey(moveErrorKeys[result.error.type])
        return
      }
      setAmount("")
    })
    // Whatever happened, the next move starts from a fresh price.
    setEstimate(null)
    setPending(false)
  }

  return (
    <>
      <div className="h-6" />
      <FadeHeader title={info.data?.name ?? formatMintLabel(mint)} />
      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 break-all">
              {info.data?.iconUrl ? (
                <img
                  src={info.data.iconUrl}
                  alt=""
                  className="size-6 rounded-full"
                />
              ) : null}
              {formatMintLabel(mint)}
              {isDefault ? (
                <Badge variant="secondary">
                  {t("settings.cashuMints.default")}
                </Badge>
              ) : null}
            </CardTitle>
            <CardDescription>
              {info.isError
                ? t("settings.cashuMints.infoUnavailable")
                : t("settings.cashuMints.balance", { amount: sats(balance) })}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              {isTrusted
                ? t("settings.cashuMints.trustDescription")
                : t("settings.cashuMints.notTrustedDescription")}
            </p>
            {isTrusted ? null : (
              <Button variant="outline" onClick={() => void trust()}>
                <ShieldCheckIcon />
                {t("settings.cashuMints.trust")}
              </Button>
            )}
            {trustErrorKey === null ? null : (
              <p className="text-sm text-destructive">{t(trustErrorKey)}</p>
            )}
            {info.data?.unsupported === true ? (
              <p className="text-sm text-destructive">
                {t("settings.cashuMints.unsupported")}
              </p>
            ) : null}
            {isTrusted && !isDefault ? (
              <Button
                variant="outline"
                onClick={() => void setAsDefault()}
                disabled={info.isError || info.data?.unsupported === true}
              >
                <StarIcon />
                {t("settings.cashuMints.setDefault")}
              </Button>
            ) : null}
            {!isTrusted && balance > 0 ? (
              <Button
                variant="outline"
                nativeButton={false}
                render={
                  <Link
                    to="/settings/payment-accounts/cashu/withdrawals/new"
                    search={{ mint }}
                  />
                }
              >
                <ArrowUpFromLineIcon />
                {t("settings.cashuMints.withdraw")}
              </Button>
            ) : null}
          </CardContent>
        </Card>

        {defaultMint !== null && !isDefault && balance > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>{t("settings.cashuMints.move.title")}</CardTitle>
              <CardDescription>
                {t("settings.cashuMints.move.description", {
                  mint: formatMintLabel(defaultMint),
                })}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <Field>
                <FieldLabel htmlFor="cashu-move-amount">
                  {t("settings.cashuMints.move.amount")}
                </FieldLabel>
                <Input
                  id="cashu-move-amount"
                  inputMode="numeric"
                  value={amount}
                  onChange={(event) => {
                    setAmount(event.target.value)
                    setEstimate(null)
                  }}
                />
                <FieldDescription>
                  {t("settings.cashuMints.move.amountDescription")}
                </FieldDescription>
                {moveErrorKey === null ? null : (
                  <FieldError>{t(moveErrorKey)}</FieldError>
                )}
              </Field>
              {estimate === null ? (
                <Button
                  variant="outline"
                  disabled={pending || !amountValid}
                  onClick={() => void estimateMove()}
                >
                  {t("settings.cashuMints.move.estimate")}
                </Button>
              ) : (
                <>
                  <p className="text-sm">
                    {t("settings.cashuMints.move.estimateResult", {
                      amount: sats(estimate.amount),
                      total: sats(estimate.totalFromSource),
                    })}
                  </p>
                  <Button disabled={pending} onClick={() => void move()}>
                    <ArrowRightLeftIcon />
                    {t("settings.cashuMints.move.confirm")}
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        ) : null}

        {isTrusted && nextDefault !== null ? (
          <Button variant="ghost" onClick={() => void untrust()}>
            <ShieldOffIcon />
            {t("settings.cashuMints.untrust")}
          </Button>
        ) : null}
      </div>
    </>
  )
}
