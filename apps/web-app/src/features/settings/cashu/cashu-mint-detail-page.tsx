import {
  type CashuMoveError,
  type CashuMoveEstimate,
  estimateCashuMove,
  moveCashuFunds,
} from "@payky/core/cashu/cashu-autoswap"
import {
  removeKnownCashuMint,
  writeCashuDefaultMint,
} from "@payky/core/cashu/cashu-mints"
import type { MintUrl } from "@payky/core/modules/cashu/cashu-types"
import { normalizeMintUrl } from "@payky/core/modules/cashu/cashu-utils"
import { Currency, Integer } from "@payky/core/modules/shared/schema"
import { useQuery } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { useAtomValue } from "jotai"
import { ArrowRightLeftIcon, StarIcon, Trash2Icon } from "lucide-react"
import { useState } from "react"
import { cashuWalletDepAtom } from "@/atoms/evolu.ts"
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
import { formatMintLabel } from "@/features/shared/cashu/cashu-mint-label.ts"
import { useCashuWallet } from "@/features/shared/cashu/use-cashu-wallet.ts"
import { useAccess, useRequirePermission } from "@/hooks/use-access.ts"
import { useLocale } from "@/hooks/use-locale.ts"
import { useCashuRunToast } from "@/hooks/use-run-toast.ts"
import { useTranslation } from "@/hooks/use-translation.ts"
import type { TranslationKey } from "@/i18n/resources.ts"
import { formatMoney } from "@/lib/format-utils.ts"

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
  ClaimedElsewhere: "settings.cashuMints.moveError.pending",
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
  const { store, snapshot, refetch } = useCashuWallet()
  const walletDep = useAtomValue(cashuWalletDepAtom)
  const info = useQuery({
    queryKey: ["cashuMintInfo", mint],
    // A fetch that records nothing: the mint is not marked seen by looking.
    queryFn: async () => {
      const wallet = await walletDep.cashuWallet.loadFresh(mint)
      const mintInfo = wallet.getMintInfo()
      return { name: mintInfo.name, iconUrl: mintInfo.cache.icon_url ?? null }
    },
    retry: false,
  })
  const [amount, setAmount] = useState("")
  const [estimate, setEstimate] = useState<CashuMoveEstimate | null>(null)
  const [moveErrorKey, setMoveErrorKey] = useState<TranslationKey | null>(null)
  const [pending, setPending] = useState(false)

  const balance = snapshot?.balances.get(mint) ?? 0
  const defaultMint = snapshot?.defaultMint ?? null
  const isDefault = defaultMint === mint
  const sats = (value: number) =>
    formatMoney({ value: Integer(value), currency: Currency.BTC }, locale)
  const parsedAmount = amount.trim() === "" ? undefined : Number(amount)
  const amountValid =
    parsedAmount === undefined ||
    (Number.isInteger(parsedAmount) && parsedAmount > 0)

  const setAsDefault = async () => {
    if (!(await require("admin", "access.action.cashuMints"))) return
    await runToast(async () => {
      await writeCashuDefaultMint(store, mint)
      await refetch()
    })
  }

  const remove = async () => {
    if (!(await require("admin", "access.action.cashuMints"))) return
    await runToast(async (run) => {
      const removed = await run(removeKnownCashuMint(mint))
      if (!removed.ok) return "settings.cashuMints.removeError.inUse"
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
    if (defaultMint === null || estimate === null) return
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
        })
      )
      if (!result.ok) {
        setMoveErrorKey(moveErrorKeys[result.error.type])
        return
      }
      setEstimate(null)
      setAmount("")
      await refetch()
    })
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
          {isDefault ? null : (
            <CardContent className="flex flex-col gap-3">
              <p className="text-sm text-muted-foreground">
                {t("settings.cashuMints.defaultWarning")}
              </p>
              <Button
                variant="outline"
                onClick={() => void setAsDefault()}
                disabled={info.isError}
              >
                <StarIcon />
                {t("settings.cashuMints.setDefault")}
              </Button>
            </CardContent>
          )}
        </Card>

        {!isDefault && balance > 0 && defaultMint !== null ? (
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

        {isDefault ? null : (
          <Button variant="ghost" onClick={() => void remove()}>
            <Trash2Icon />
            {t("settings.cashuMints.remove")}
          </Button>
        )}
      </div>
    </>
  )
}
