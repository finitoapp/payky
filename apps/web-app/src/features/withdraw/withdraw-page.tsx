import {
  confirmOutcome,
  createWithdrawDraft,
  draftComment,
  initialWithdrawState,
  quoteErrorMessage,
  type WithdrawReviewState,
  withdrawPinDetail,
  withdrawReducer,
} from "@payky/app-shared/withdraw-flow"
import type { AccountId } from "@payky/core/modules/account/account-types"
import {
  executeWithdrawal,
  quoteWithdrawal,
} from "@payky/core/modules/withdraw/withdraw-actions"
import { useNavigate } from "@tanstack/react-router"
import { useStore } from "jotai"
import { useReducer, useRef, useState } from "react"
import { accountAtom } from "@/atoms/account.ts"
import { FadeHeader } from "@/components/fade-header.tsx"
import { useAccess, useRequirePermission } from "@/hooks/use-access.ts"
import { useAppRun } from "@/hooks/use-app-run.ts"
import { useLocale } from "@/hooks/use-locale.ts"
import { useTranslation } from "@/hooks/use-translation.ts"
import { useSparkBalance } from "./use-spark-balance.ts"
import {
  useWithdrawAccountId,
  WithdrawNoAccountCard,
} from "./withdraw-account.tsx"
import { WithdrawFormStep } from "./withdraw-form-step.tsx"
import { WithdrawReviewStep } from "./withdraw-review-step.tsx"

export function WithdrawPage({
  initialDestination,
}: {
  readonly initialDestination: string
}) {
  const { t } = useTranslation()
  const accountId = useWithdrawAccountId("spark")

  return (
    <>
      <div className="h-6" />
      <FadeHeader title={t("withdraw.form.title")} />
      {accountId === undefined ? (
        <WithdrawNoAccountCard method="spark" />
      ) : (
        <WithdrawFlow
          accountId={accountId}
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
  // A send may or may not have happened: nothing is confirmed again from this
  // review until the merchant has gone back (withdraw/0007).
  const [uncertain, setUncertain] = useState(false)
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
    // Stays locked after a send was started: only a retryable end unlocks.
    let retryable = true
    try {
      retryable = await confirmReviewedWithdrawal(state)
    } finally {
      if (retryable) confirmingRef.current = false
    }
  }

  /** `true` when nothing was sent and the review may be confirmed again. */
  const confirmReviewedWithdrawal = async (
    review: WithdrawReviewState
  ): Promise<boolean> => {
    dispatch({ type: "CONFIRM_STARTED" })

    // Moving money always asks for the PIN, session or not (access/0007).
    // With access control off there is no PIN, and `require` lets it through.
    const pinDetail = withdrawPinDetail({
      quote: review.quote,
      exitSpeed: review.exitSpeed,
      t,
      locale,
    })
    const allowed = access.enabled
      ? await requirePin("access.action.withdraw", pinDetail)
      : await require("admin", "access.action.withdraw")
    if (!allowed) {
      dispatch({ type: "CONFIRM_FINISHED" })
      return true
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
          comment: draftComment(draft),
        })
      )

      const outcome = confirmOutcome(result, t)
      if (outcome.kind === "recorded") {
        // Recorded: its detail follows what happens next.
        await navigate({
          to: "/settings/payment-accounts/spark/withdrawals/$withdrawalId",
          params: { withdrawalId: outcome.withdrawalId },
        })
        return false
      }
      dispatch({ type: "CONFIRM_FAILED", error: outcome.message })
      return true
    } catch {
      // Thrown after the money may have moved is indistinguishable from
      // thrown before it: never offer a retry.
      setUncertain(true)
      dispatch({
        type: "CONFIRM_FAILED",
        error: t("withdraw.review.error.uncertain"),
      })
      return false
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
      comment={draftComment(draft)}
      exitSpeed={state.exitSpeed}
      confirming={state.confirming}
      requoting={requoting}
      confirmError={state.confirmError}
      uncertain={uncertain}
      onExitSpeedChange={(exitSpeed) =>
        dispatch({ type: "SET_EXIT_SPEED", exitSpeed })
      }
      onBack={() => {
        if (confirmingRef.current && !uncertain) return
        setUncertain(false)
        confirmingRef.current = false
        dispatch({ type: "BACK" })
      }}
      onConfirm={() => void confirmWithdrawal()}
      onNewQuote={() => void requote()}
      onOpenHistory={() =>
        void navigate({ to: "/settings/payment-accounts/spark/withdrawals" })
      }
      locale={locale}
    />
  )
}
