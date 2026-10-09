import { Link, useNavigate } from "@tanstack/react-router"
import { useStore } from "jotai"
import { useReducer, useRef, useState } from "react"

import { accountAtom } from "@/atoms/account.ts"
import { FadeHeader } from "@/components/fade-header.tsx"
import { Button } from "@/components/ui/button.tsx"
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx"
import { activeSparkAccountsQuery } from "@/core/modules/account/account-spark-queries.ts"
import type { AccountId } from "@/core/modules/account/account-types.ts"
import {
  executeWithdrawal,
  quoteWithdrawal,
} from "@/core/modules/withdraw/withdraw-actions.ts"
import { withdrawalRecipientSats } from "@/core/modules/withdraw/withdraw-utils.ts"
import { useAccess, useRequirePermission } from "@/hooks/use-access.ts"
import { useAppRun } from "@/hooks/use-app-run.ts"
import { useEvoluQuery } from "@/hooks/use-evolu-query.ts"
import { useLocale } from "@/hooks/use-locale.ts"
import { useTranslation } from "@/hooks/use-translation.ts"
import { formatSatsAmount } from "@/lib/format-utils.ts"
import { useSparkBalance } from "./use-spark-balance.ts"
import {
  createWithdrawDraft,
  earlyConfirmErrorKeys,
  initialWithdrawState,
  quoteErrorMessage,
  type WithdrawReviewState,
  withdrawReducer,
} from "./withdraw-flow.ts"
import { WithdrawFormStep } from "./withdraw-form-step.tsx"
import { WithdrawReviewStep } from "./withdraw-review-step.tsx"

export function WithdrawNoAccountCard() {
  const { t } = useTranslation()
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("withdraw.noAccount.title")}</CardTitle>
        <CardDescription>{t("withdraw.noAccount.description")}</CardDescription>
      </CardHeader>
      <CardFooter>
        <Button
          className="w-fit"
          nativeButton={false}
          render={<Link to="/settings/payment-accounts" />}
        >
          {t("withdraw.noAccount.action")}
        </Button>
      </CardFooter>
    </Card>
  )
}

export function WithdrawPage({
  initialDestination,
}: {
  readonly initialDestination: string
}) {
  const { t } = useTranslation()
  const { data: sparkAccountsData } = useEvoluQuery(activeSparkAccountsQuery)
  const [sparkAccount] = sparkAccountsData

  return (
    <>
      <div className="h-6" />
      <FadeHeader title={t("withdraw.form.title")} />
      {sparkAccount === undefined ? (
        <WithdrawNoAccountCard />
      ) : (
        <WithdrawFlow
          accountId={sparkAccount.id}
          initialDestination={initialDestination}
        />
      )}
    </>
  )
}

function WithdrawFlow({
  accountId,
  initialDestination,
}: {
  readonly accountId: AccountId
  readonly initialDestination: string
}) {
  const appRun = useAppRun()
  const navigate = useNavigate()
  const access = useAccess()
  const { require, requirePin } = useRequirePermission()
  const jotaiStore = useStore()
  const { t } = useTranslation()
  const locale = useLocale()
  const [state, dispatch] = useReducer(withdrawReducer, initialWithdrawState)
  const [requoting, setRequoting] = useState(false)
  const [draft, setDraft] = useState(() =>
    createWithdrawDraft(initialDestination)
  )

  const availableSats = useSparkBalance(accountId)
  // `state.confirming` lags a render behind: a second press before it lands
  // must not send the same quote twice.
  const confirmingRef = useRef(false)

  const confirmWithdrawal = async () => {
    if (state.step !== "review" || confirmingRef.current) return
    confirmingRef.current = true
    try {
      await confirmReviewedWithdrawal(state)
    } finally {
      confirmingRef.current = false
    }
  }

  const confirmReviewedWithdrawal = async (review: WithdrawReviewState) => {
    dispatch({ type: "CONFIRM_STARTED" })

    // Moving money always asks for the PIN, session or not (access/0007).
    // With access control off there is no PIN, and `require` lets it through.
    const { quote } = review
    const pinDetail = t("withdraw.review.pinDetail", {
      amount: formatSatsAmount(
        withdrawalRecipientSats(quote, review.exitSpeed),
        locale
      ),
      destination:
        quote.kind === "onchain"
          ? quote.onchainAddress
          : (quote.lightningAddress ??
            t("withdraw.destination.kind.lightningInvoice")),
    })
    const allowed = access.enabled
      ? await requirePin("access.action.withdraw", pinDetail)
      : await require("admin", "access.action.withdraw")
    if (!allowed) {
      dispatch({ type: "CONFIRM_FINISHED" })
      return
    }

    try {
      const { device } = await jotaiStore.get(accountAtom)
      await using run = appRun()
      const result = await run(
        executeWithdrawal({
          accountId,
          quote: review.quote,
          exitSpeed: review.exitSpeed,
          deviceId: device.id,
        })
      )

      if (result.ok) {
        await navigate({
          to: "/settings/payment-accounts/spark/withdrawals/$withdrawalId",
          params: { withdrawalId: result.value.withdrawalId },
        })
        return
      }
      // Recorded: its detail follows what happens next.
      if (
        result.error.type === "WithdrawalRejected" ||
        result.error.type === "WithdrawalOutcomeUnknown"
      ) {
        await navigate({
          to: "/settings/payment-accounts/spark/withdrawals/$withdrawalId",
          params: { withdrawalId: result.error.withdrawalId },
        })
        return
      }
      dispatch({
        type: "CONFIRM_FAILED",
        error:
          result.error.type === "WithdrawalBelowMinimum"
            ? t("withdraw.error.belowMinimum", {
                amount: result.error.minSats,
              })
            : t(earlyConfirmErrorKeys[result.error.type]),
      })
    } catch {
      dispatch({
        type: "CONFIRM_FAILED",
        error: t("withdraw.review.error.generic"),
      })
    }
  }

  const requote = async () => {
    if (state.step !== "review") return
    setRequoting(true)
    try {
      await using run = appRun()
      const result = await run(quoteWithdrawal({ accountId, ...state.request }))
      if (result.ok) {
        dispatch({ type: "REQUOTED", quote: result.value })
      } else {
        dispatch({
          type: "CONFIRM_FAILED",
          error: quoteErrorMessage(result.error, t),
        })
      }
    } catch {
      dispatch({
        type: "CONFIRM_FAILED",
        error: t("withdraw.quoteError.generic"),
      })
    } finally {
      setRequoting(false)
    }
  }

  if (state.step === "form") {
    return (
      <WithdrawFormStep
        accountId={accountId}
        availableSats={availableSats}
        draft={draft}
        onDraftChange={setDraft}
        onReview={(request, quote) =>
          dispatch({ type: "OPEN_REVIEW", request, quote })
        }
      />
    )
  }

  return (
    <WithdrawReviewStep
      quote={state.quote}
      exitSpeed={state.exitSpeed}
      confirming={state.confirming}
      requoting={requoting}
      confirmError={state.confirmError}
      onExitSpeedChange={(exitSpeed) =>
        dispatch({ type: "SET_EXIT_SPEED", exitSpeed })
      }
      onBack={() => dispatch({ type: "BACK" })}
      onConfirm={() => void confirmWithdrawal()}
      onNewQuote={() => void requote()}
      locale={locale}
    />
  )
}
