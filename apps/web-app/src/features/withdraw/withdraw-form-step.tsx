import type { AccountId } from "@payky/core/modules/account/account-types"
import { PositiveIntegerSchema } from "@payky/core/modules/shared/schema"
import {
  quoteWithdrawal,
  type WithdrawalQuote,
} from "@payky/core/modules/withdraw/withdraw-actions"
import { parseWithdrawDestination } from "@payky/core/modules/withdraw/withdraw-destination-utils"
import { ONCHAIN_WITHDRAWAL_MIN_SATS } from "@payky/core/modules/withdraw/withdraw-utils"
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
import { FieldError, FieldGroup } from "@/components/ui/field.tsx"
import { useAppRun } from "@/hooks/use-app-run.ts"
import { useTranslation } from "@/hooks/use-translation.ts"
import { useBtcFiat } from "./use-btc-fiat.ts"
import {
  WithdrawAllField,
  withdrawAllUnavailableKey,
} from "./withdraw-all-field.tsx"
import { WithdrawAmountField } from "./withdraw-amount-field.tsx"
import {
  useWithdrawDestination,
  WithdrawDestinationField,
} from "./withdraw-destination-field.tsx"
import {
  draftAmountSats,
  quoteErrorMessage,
  type WithdrawDraft,
  type WithdrawRequest,
} from "./withdraw-flow.ts"
import { WithdrawOptionsFields } from "./withdraw-options-fields.tsx"

export function WithdrawFormStep({
  accountId,
  availableSats,
  draft,
  onDraftChange,
  onReview,
}: {
  readonly accountId: AccountId
  readonly availableSats: number | null
  readonly draft: WithdrawDraft
  readonly onDraftChange: (draft: WithdrawDraft) => void
  readonly onReview: (request: WithdrawRequest, quote: WithdrawalQuote) => void
}) {
  const appRun = useAppRun()
  const { t } = useTranslation()
  const fiat = useBtcFiat()
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const update = (patch: Partial<WithdrawDraft>) => {
    setSubmitError(null)
    onDraftChange({ ...draft, ...patch })
  }

  const destinationState = useWithdrawDestination(draft.destination, "spark")
  const { destination, invoiceAmountSats } = destinationState
  const withdrawAllUnavailable = withdrawAllUnavailableKey(destination)
  const effectiveWithdrawAll =
    draft.withdrawAll && withdrawAllUnavailable === null
  const typedSats = draftAmountSats(draft, fiat)

  const changeDestination = (value: string) => {
    const next = parseWithdrawDestination(value)
    if (next.ok && next.value.kind === "onchain" && next.value.amountSats) {
      update({
        destination: value,
        withdrawAll: false,
        unit: "sats",
        amount: String(next.value.amountSats),
      })
      return
    }
    update({ destination: value })
  }

  const submitForm = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitError(null)

    if (destination === null || destination.kind === "unsupported") {
      setSubmitError(
        t(destinationState.error ?? "withdraw.destination.invalid")
      )
      return
    }

    let amountSats: WithdrawRequest["amountSats"]
    if (invoiceAmountSats === null && !effectiveWithdrawAll) {
      const amount = PositiveIntegerSchema.safeParse(typedSats)
      if (!amount.success) {
        setSubmitError(t("withdraw.amount.invalid"))
        return
      }
      amountSats = amount.data
    }

    const request: WithdrawRequest = {
      destination,
      amountSats,
      recipientComment: draft.recipientComment,
    }
    setPending(true)
    try {
      await using run = appRun()
      const result = await run(quoteWithdrawal({ accountId, ...request }))
      if (!result.ok) {
        setSubmitError(quoteErrorMessage(result.error, t))
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
          <CardDescription>{t("withdraw.form.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <WithdrawDestinationField
              value={draft.destination}
              onChange={changeDestination}
              state={destinationState}
              method="spark"
            />

            <WithdrawAmountField
              draft={draft}
              onChange={update}
              fiat={fiat}
              invoiceAmountSats={invoiceAmountSats}
              range={destinationState.range}
              withdrawAll={effectiveWithdrawAll}
              onchainMinimumSats={
                destination?.kind === "onchain"
                  ? ONCHAIN_WITHDRAWAL_MIN_SATS
                  : null
              }
              availableSats={availableSats}
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
          <Button type="submit" disabled={pending}>
            {pending ? <LoaderCircleIcon className="animate-spin" /> : null}
            {pending ? t("withdraw.quotePending") : t("withdraw.continue")}
          </Button>
        </CardFooter>
      </Card>
    </form>
  )
}
