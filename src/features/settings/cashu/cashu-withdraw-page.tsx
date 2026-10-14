import { useAtomValue } from "jotai"
import { ArrowUpFromLineIcon } from "lucide-react"
import { useState } from "react"

import { accountAtom } from "@/atoms/account.ts"
import { FadeHeader } from "@/components/fade-header.tsx"
import { Button } from "@/components/ui/button.tsx"
import {
  Card,
  CardContent,
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
import { VerticalNav } from "@/components/vertical-nav.tsx"
import { cashuAccountQuery } from "@/core/modules/account/account-queries.ts"
import type { AccountId } from "@/core/modules/account/account-types.ts"
import type { MintUrl } from "@/core/modules/cashu/cashu-types.ts"
import {
  Currency,
  Integer,
  PositiveInteger,
} from "@/core/modules/shared/schema.ts"
import {
  type CashuWithdrawalQuote,
  type ExecuteCashuWithdrawalError,
  executeCashuWithdrawal,
  type QuoteCashuWithdrawalError,
  quoteCashuWithdrawal,
} from "@/core/modules/withdraw/withdraw-cashu-actions.ts"
import { parseWithdrawDestination } from "@/core/modules/withdraw/withdraw-destination-utils.ts"
import { cashuWithdrawalsQuery } from "@/core/modules/withdraw/withdraw-queries.ts"
import { formatMintLabel } from "@/features/settings/cashu/cashu-mint-label.ts"
import { useCashuWallet } from "@/features/settings/cashu/use-cashu-wallet.ts"
import { useAccess, useRequirePermission } from "@/hooks/use-access.ts"
import { useEvoluQuery } from "@/hooks/use-evolu-query.ts"
import { useLocale } from "@/hooks/use-locale.ts"
import { useRunToast } from "@/hooks/use-run-toast.ts"
import { useTranslation } from "@/hooks/use-translation.ts"
import type { TranslationKey } from "@/i18n/resources.ts"
import { formatMoney } from "@/lib/format-utils.ts"

const quoteErrorKeys = {
  MintUnreachable: "settings.cashuWithdraw.error.unreachable",
  MintRejected: "settings.cashuWithdraw.error.rejected",
  CashuWithdrawalAmountNeeded: "settings.cashuWithdraw.error.amountNeeded",
  CashuWithdrawalToSelf: "settings.cashuWithdraw.error.toSelf",
  CashuWithdrawalInvoiceExpired: "settings.cashuWithdraw.error.expired",
  CashuWithdrawalDestinationUnsupported:
    "settings.cashuWithdraw.error.destination",
  FetchError: "settings.cashuWithdraw.error.address",
  LnurlRequestError: "settings.cashuWithdraw.error.address",
  LnurlHttpError: "settings.cashuWithdraw.error.address",
  LnurlResponseError: "settings.cashuWithdraw.error.address",
  LightningAddressInvoiceMismatch: "settings.cashuWithdraw.error.address",
} satisfies Record<QuoteCashuWithdrawalError["type"], TranslationKey>

const executeErrorKeys = {
  MintUnreachable: "settings.cashuWithdraw.error.unreachable",
  MintRejected: "settings.cashuWithdraw.error.rejected",
  CounterLockTimeout: "settings.cashuWithdraw.error.unreachable",
  QuoteExpired: "settings.cashuWithdraw.error.expired",
  CashuInsufficientFunds: "settings.cashuWithdraw.error.insufficient",
  CashuMeltQuoteNotPayable: "settings.cashuWithdraw.error.rejected",
  CashuMeltUnpaid: "settings.cashuWithdraw.error.rejected",
  CashuMeltPending: "settings.cashuWithdraw.pending",
  CashuWithdrawalDestinationUnsupported:
    "settings.cashuWithdraw.error.destination",
} satisfies Record<ExecuteCashuWithdrawalError["type"], TranslationKey>

/**
 * A Lightning withdrawal from one mint of the wallet shared with Linky
 * (cashu.md §6): the default mint preselected, an invoice or a Lightning
 * address, the mint's own fee reserve, and the PIN before anything leaves.
 */
export function CashuWithdrawPage() {
  const { t } = useTranslation()
  const locale = useLocale()
  const runToast = useRunToast()
  const access = useAccess()
  const { require, requirePin } = useRequirePermission()
  const { device } = useAtomValue(accountAtom)
  const { snapshot, refetch } = useCashuWallet()
  const { data: accounts } = useEvoluQuery(cashuAccountQuery)
  const [account] = accounts
  const [chosenMint, setChosenMint] = useState<MintUrl | null>(null)
  const [destination, setDestination] = useState("")
  const [amount, setAmount] = useState("")
  const [quote, setQuote] = useState<CashuWithdrawalQuote | null>(null)
  const [errorKey, setErrorKey] = useState<TranslationKey | null>(null)
  const [doneKey, setDoneKey] = useState<TranslationKey | null>(null)
  const [pending, setPending] = useState(false)

  const sats = (value: number) =>
    formatMoney({ value: Integer(value), currency: Currency.BTC }, locale)
  const funded = [...(snapshot?.balances ?? new Map<MintUrl, number>())]
    .filter(([, balance]) => balance > 0)
    .toSorted(([a], [b]) => a.localeCompare(b))
  const mint =
    chosenMint ??
    (funded.some(([candidate]) => candidate === snapshot?.defaultMint)
      ? (snapshot?.defaultMint ?? null)
      : (funded[0]?.[0] ?? null))

  const review = async () => {
    if (mint === null) return
    const parsed = parseWithdrawDestination(destination)
    if (!parsed.ok) {
      setErrorKey("settings.cashuWithdraw.error.destination")
      return
    }
    const parsedAmount = amount.trim() === "" ? undefined : Number(amount)
    setPending(true)
    setErrorKey(null)
    setDoneKey(null)
    await runToast(async (run) => {
      const result = await run(
        quoteCashuWithdrawal({
          mint,
          destination: parsed.value,
          ...(parsedAmount !== undefined &&
          Number.isInteger(parsedAmount) &&
          parsedAmount > 0
            ? { amountSats: PositiveInteger(parsedAmount) }
            : {}),
        })
      )
      if (result.ok) setQuote(result.value)
      else setErrorKey(quoteErrorKeys[result.error.type])
    })
    setPending(false)
  }

  const withdraw = async () => {
    if (quote === null || account === undefined) return
    // Moving money always asks for the PIN (access/0007).
    const detail = t("settings.cashuWithdraw.pinDetail", {
      amount: sats(quote.amountSats),
      destination:
        quote.lightningAddress ?? t("settings.cashuWithdraw.invoice"),
    })
    const allowed = access.enabled
      ? await requirePin("access.action.withdraw", detail)
      : await require("admin", "access.action.withdraw")
    if (!allowed) return
    setPending(true)
    await runToast(async (run) => {
      const result = await run(
        executeCashuWithdrawal({
          accountId: account.id,
          deviceId: device.id,
          quote,
        })
      )
      setQuote(null)
      if (result.ok) {
        setDoneKey("settings.cashuWithdraw.done")
        setDestination("")
        setAmount("")
      } else setErrorKey(executeErrorKeys[result.error.type])
      await refetch()
    })
    setPending(false)
  }

  return (
    <>
      <div className="h-6" />
      <FadeHeader title={t("settings.cashuWithdraw.title")} />
      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle>{t("settings.cashuWithdraw.mint")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {funded.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t("settings.cashuWithdraw.noFunds")}
              </p>
            ) : (
              funded.map(([candidate, balance]) => (
                <Button
                  key={candidate}
                  type="button"
                  variant={candidate === mint ? "default" : "outline"}
                  className="justify-between"
                  onClick={() => {
                    setChosenMint(candidate)
                    setQuote(null)
                  }}
                >
                  <span className="min-w-0 truncate">
                    {formatMintLabel(candidate)}
                  </span>
                  <span className="tabular-nums">{sats(balance)}</span>
                </Button>
              ))
            )}
          </CardContent>
        </Card>

        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            void (quote === null ? review() : withdraw())
          }}
        >
          <Field>
            <FieldLabel htmlFor="cashu-withdraw-destination">
              {t("settings.cashuWithdraw.destination")}
            </FieldLabel>
            <Input
              id="cashu-withdraw-destination"
              value={destination}
              autoComplete="off"
              onChange={(event) => {
                setDestination(event.target.value)
                setQuote(null)
              }}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="cashu-withdraw-amount">
              {t("settings.cashuWithdraw.amount")}
            </FieldLabel>
            <Input
              id="cashu-withdraw-amount"
              inputMode="numeric"
              value={amount}
              onChange={(event) => {
                setAmount(event.target.value)
                setQuote(null)
              }}
            />
            <FieldDescription>
              {t("settings.cashuWithdraw.amountDescription")}
            </FieldDescription>
            {errorKey === null ? null : <FieldError>{t(errorKey)}</FieldError>}
          </Field>
          {quote === null ? null : (
            <p className="text-sm" role="status">
              {t("settings.cashuWithdraw.review", {
                amount: sats(quote.amountSats),
                total: sats(quote.cost.maxTotal),
                reserve: sats(quote.cost.feeReserve),
              })}
            </p>
          )}
          {doneKey === null ? null : (
            <p className="text-sm font-medium" role="status">
              {t(doneKey)}
            </p>
          )}
          <Button
            type="submit"
            disabled={pending || mint === null || destination.trim() === ""}
          >
            <ArrowUpFromLineIcon />
            {quote === null
              ? t("settings.cashuWithdraw.reviewButton")
              : t("settings.cashuWithdraw.confirm")}
          </Button>
        </form>

        {account === undefined ? null : (
          <CashuWithdrawals accountId={account.id} />
        )}
      </div>
    </>
  )
}

function CashuWithdrawals({ accountId }: { readonly accountId: AccountId }) {
  const { t } = useTranslation()
  const locale = useLocale()
  const { data: withdrawals } = useEvoluQuery(cashuWithdrawalsQuery(accountId))
  const sats = (value: number) =>
    formatMoney({ value: Integer(value), currency: Currency.BTC }, locale)
  return (
    <VerticalNav
      title={t("settings.cashuWithdraw.history")}
      empty={t("settings.cashuWithdraw.historyEmpty")}
      items={withdrawals.map((row) => ({
        id: row.id,
        kind: "static" as const,
        label: (
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate">
              {row.lightningAddress ??
                (row.mintUrl === null ? "" : formatMintLabel(row.mintUrl))}
            </span>
            <span className="text-xs text-muted-foreground">
              {t(
                row.failedAt !== null
                  ? "settings.cashuWithdraw.state.failed"
                  : row.movedAmount !== null
                    ? "settings.cashuWithdraw.state.done"
                    : "settings.cashuWithdraw.state.pending"
              )}
            </span>
          </span>
        ),
        action: (
          <span className="text-xs tabular-nums">
            {sats(row.amountSats ?? 0)}
          </span>
        ),
      }))}
    />
  )
}
