import type { AbortError } from "@evolu/common"
import type { TranslationKey } from "@payky/app-shared/i18n/resources"
import {
  amountErrorMessage,
  draftAmountSats,
  type Translate,
  type WithdrawDraft,
  withdrawAllUnavailableKey,
} from "@payky/app-shared/withdraw-flow"
import type { MintUrl } from "@payky/core/modules/cashu/cashu-types"
import {
  type PositiveInteger,
  PositiveIntegerSchema,
} from "@payky/core/modules/shared/schema"
import {
  type CashuWithdrawalQuote,
  type QuoteCashuWithdrawalError,
  quoteCashuWithdrawal,
} from "@payky/core/modules/withdraw/withdraw-cashu-actions"
import type { WithdrawDestination } from "@payky/core/modules/withdraw/withdraw-destination-utils"
import { LoaderCircleIcon } from "lucide-react"
import { type FormEvent, useState } from "react"
import { Button } from "@/components/ui/button.tsx"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field.tsx"
import { formatMintLabel } from "@/features/shared/cashu/cashu-mint-label.ts"
import { useCashuAppRun } from "@/hooks/use-app-run.ts"
import { useLocale } from "@/hooks/use-locale.ts"
import { useTranslation } from "@/hooks/use-translation.ts"
import { formatSatsAmount } from "@/lib/format-utils.ts"
import { useBtcFiat } from "./use-btc-fiat.ts"
import { WithdrawAllField } from "./withdraw-all-field.tsx"
import { WithdrawAmountField } from "./withdraw-amount-field.tsx"
import {
  useWithdrawDestination,
  WithdrawDestinationField,
} from "./withdraw-destination-field.tsx"
import { WithdrawOptionsFields } from "./withdraw-options-fields.tsx"

const lightningAddressUnavailable = "withdraw.error.lightningAddressUnavailable"

const cashuQuoteErrorKeys = {
  AbortError: "withdraw.quoteError.generic",
  MintUnreachable: "withdraw.cashu.error.unreachable",
  MintRejected: "withdraw.cashu.error.rejected",
  CashuWithdrawalAmountNeeded: "withdraw.amount.invalid",
  CashuWithdrawalToSelf: "withdraw.cashu.error.toSelf",
  CashuWithdrawalInvoiceExpired: "withdraw.error.lightningInvoiceExpired",
  CashuWithdrawalDestinationUnsupported: "withdraw.cashu.error.destination",
  LightningAddressInvoiceMismatch: "withdraw.error.lightningAddressMismatch",
  FetchError: lightningAddressUnavailable,
  LnurlRequestError: lightningAddressUnavailable,
  LnurlHttpError: lightningAddressUnavailable,
  LnurlResponseError: lightningAddressUnavailable,
} satisfies Record<
  Exclude<
    (QuoteCashuWithdrawalError | AbortError)["type"],
    "InsufficientWithdrawalBalance" | "WithdrawalAmountOutOfRange"
  >,
  TranslationKey
>

export const cashuQuoteErrorMessage = (
  error: QuoteCashuWithdrawalError | AbortError,
  t: Translate
): string =>
  error.type === "InsufficientWithdrawalBalance" ||
  error.type === "WithdrawalAmountOutOfRange"
    ? amountErrorMessage(error, t)
    : t(cashuQuoteErrorKeys[error.type])

/** What the merchant asked for, kept so the review can fetch a new quote. */
export interface CashuWithdrawRequest {
  readonly mint: MintUrl
  readonly destination: WithdrawDestination
  /**
   * `undefined` for an invoice, which carries its own amount, or "withdraw
   * all" to a Lightning address (withdraw/0014).
   */
  readonly amountSats: PositiveInteger | undefined
  /** LUD-12, for a Lightning address that accepts it; ignored elsewhere. */
  readonly recipientComment: string
}

/**
 * The Cashu withdrawal form: which mint, then the same destination, amount,
 * "withdraw all" and options as Spark's, minus on-chain and amountless
 * invoices (withdraw/0011, withdraw/0014).
 */
export function CashuWithdrawFormStep({
  funded,
  mint,
  onMintChange,
  draft,
  onDraftChange,
  onReview,
}: {
  /** The mints holding ecash, with their balances. */
  readonly funded: ReadonlyArray<readonly [MintUrl, number]>
  readonly mint: MintUrl | null
  readonly onMintChange: (mint: MintUrl) => void
  readonly draft: WithdrawDraft
  readonly onDraftChange: (draft: WithdrawDraft) => void
  readonly onReview: (
    request: CashuWithdrawRequest,
    quote: CashuWithdrawalQuote
  ) => void
}) {
  const cashuAppRun = useCashuAppRun()
  const { t } = useTranslation()
  const locale = useLocale()
  const fiat = useBtcFiat()
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const update = (patch: Partial<WithdrawDraft>) => {
    setSubmitError(null)
    onDraftChange({ ...draft, ...patch })
  }

  const destinationState = useWithdrawDestination(draft.destination, "cashu")
  const { destination, invoiceAmountSats } = destinationState
  const withdrawAllUnavailable = withdrawAllUnavailableKey(destination)
  const effectiveWithdrawAll =
    draft.withdrawAll && withdrawAllUnavailable === null
  const mintBalance =
    funded.find(([candidate]) => candidate === mint)?.[1] ?? null

  const submitForm = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitError(null)
    if (mint === null) return

    if (destination === null) {
      setSubmitError(
        t(destinationState.error ?? "withdraw.cashu.error.destination")
      )
      return
    }

    let amountSats: CashuWithdrawRequest["amountSats"]
    if (invoiceAmountSats === null && !effectiveWithdrawAll) {
      const amount = PositiveIntegerSchema.safeParse(
        draftAmountSats(draft, fiat)
      )
      if (!amount.success) {
        setSubmitError(t("withdraw.amount.invalid"))
        return
      }
      amountSats = amount.data
    }

    const request: CashuWithdrawRequest = {
      mint,
      destination,
      amountSats,
      recipientComment: draft.recipientComment,
    }
    setPending(true)
    try {
      await using run = await cashuAppRun()
      const result = await run(quoteCashuWithdrawal(request))
      if (!result.ok) {
        setSubmitError(cashuQuoteErrorMessage(result.error, t))
        return
      }
      onReview(request, result.value)
    } catch {
      setSubmitError(t("withdraw.quoteError.generic"))
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={(event) => void submitForm(event)}>
      <Card>
        <CardHeader>
          <CardTitle>{t("withdraw.form.title")}</CardTitle>
          <CardDescription>
            {t("withdraw.cashu.form.description")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field>
              <FieldLabel>{t("withdraw.cashu.mint")}</FieldLabel>
              {funded.length === 0 ? (
                <FieldDescription>
                  {t("withdraw.cashu.noFunds")}
                </FieldDescription>
              ) : (
                <div className="flex flex-col gap-2">
                  {funded.map(([candidate, balance]) => (
                    <Button
                      key={candidate}
                      type="button"
                      variant={candidate === mint ? "default" : "outline"}
                      className="justify-between"
                      aria-pressed={candidate === mint}
                      onClick={() => {
                        setSubmitError(null)
                        onMintChange(candidate)
                      }}
                    >
                      <span className="min-w-0 truncate">
                        {formatMintLabel(candidate)}
                      </span>
                      <span className="tabular-nums">
                        {t("withdraw.sats", {
                          amount: formatSatsAmount(balance, locale),
                        })}
                      </span>
                    </Button>
                  ))}
                </div>
              )}
            </Field>

            <WithdrawDestinationField
              value={draft.destination}
              onChange={(value) => update({ destination: value })}
              state={destinationState}
              method="cashu"
            />

            <WithdrawAmountField
              draft={draft}
              onChange={update}
              fiat={fiat}
              invoiceAmountSats={invoiceAmountSats}
              range={destinationState.range}
              withdrawAll={effectiveWithdrawAll}
              onchainMinimumSats={null}
              availableSats={mintBalance}
            />

            <WithdrawAllField
              checked={effectiveWithdrawAll}
              unavailableKey={withdrawAllUnavailable}
              onChange={(withdrawAll) => update({ withdrawAll })}
            />

            <WithdrawOptionsFields
              draft={draft}
              onChange={update}
              commentAllowed={destinationState.commentAllowed}
            />

            <FieldError>{submitError}</FieldError>
          </FieldGroup>
        </CardContent>
        <CardFooter>
          <Button type="submit" disabled={pending || mint === null}>
            {pending ? <LoaderCircleIcon className="animate-spin" /> : null}
            {pending ? t("withdraw.quotePending") : t("withdraw.continue")}
          </Button>
        </CardFooter>
      </Card>
    </form>
  )
}
