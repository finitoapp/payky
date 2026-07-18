import type { AbortError } from "@evolu/common"
import { Link } from "@tanstack/react-router"
import assertNever from "assert-never"
import { useStore } from "jotai"
import { useEffect, useReducer, useState } from "react"

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
import { PositiveInteger } from "@/core/modules/shared/schema.ts"
import { executeWithdrawal } from "@/core/modules/withdrawal/withdrawal-actions.ts"
import type { ExecuteWithdrawalError } from "@/core/modules/withdrawal/withdrawal-types.ts"
import { createDefaultSparkPaymentWallet } from "@/core/spark/spark-wallet.ts"
import { useAppRun } from "@/hooks/use-app-run.ts"
import { useEvoluQuery } from "@/hooks/use-evolu-query.ts"
import { useLocale } from "@/hooks/use-locale.ts"
import { useTranslation } from "@/hooks/use-translation.ts"
import type { TranslationKey } from "@/i18n/resources.ts"
import { initialWithdrawState, withdrawReducer } from "./withdraw-flow.ts"
import { WithdrawFormStep } from "./withdraw-form-step.tsx"
import { WithdrawResultStep } from "./withdraw-result-step.tsx"
import { WithdrawReviewStep } from "./withdraw-review-step.tsx"

type ConfirmWithdrawalError = ExecuteWithdrawalError | AbortError

const confirmErrorKey = (error: ConfirmWithdrawalError): TranslationKey => {
  switch (error.type) {
    case "AbortError":
      return "withdraw.review.error.interrupted"
    case "WithdrawalAccountNotFound":
      return "withdraw.error.accountNotFound"
    case "WithdrawalRequestFailed":
      return "withdraw.review.error.sparkFailed"
    case "WithdrawalRecordingFailed":
      return "withdraw.review.error.recordFailed"
  }

  return assertNever(error)
}

export function WithdrawPage() {
  const appRun = useAppRun()
  const jotaiStore = useStore()
  const { t } = useTranslation()
  const locale = useLocale()
  const { data: sparkAccountsData } = useEvoluQuery(activeSparkAccountsQuery)
  const [sparkAccount] = sparkAccountsData
  const [state, dispatch] = useReducer(withdrawReducer, initialWithdrawState)
  const [availableSats, setAvailableSats] = useState<number | null>(null)

  useEffect(() => {
    const secret = sparkAccount?.secret
    let active = true

    setAvailableSats(null)
    if (!secret) return

    const loadBalance = async () => {
      try {
        await using wallet = await createDefaultSparkPaymentWallet(secret)
        const balance = await wallet.getBalance()
        if (active) setAvailableSats(balance.availableSats)
      } catch {
        if (active) setAvailableSats(null)
      }
    }

    void loadBalance()

    return () => {
      active = false
    }
  }, [sparkAccount?.secret])

  if (!sparkAccount) {
    return (
      <>
        <div className="h-6" />
        <FadeHeader title={t("settings.withdrawals.title")} />
        <Card>
          <CardHeader>
            <CardTitle>{t("withdraw.noAccount.title")}</CardTitle>
            <CardDescription>
              {t("withdraw.noAccount.description")}
            </CardDescription>
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
      </>
    )
  }

  const confirmWithdrawal = async () => {
    if (state.step !== "review") return

    dispatch({ type: "CONFIRM_STARTED" })
    try {
      const { device } = await jotaiStore.get(accountAtom)
      await using run = appRun()
      const executeResult = await run(
        executeWithdrawal({
          accountId: sparkAccount.id,
          onchainAddress: state.address,
          amountSats: PositiveInteger(state.quote.amountSats),
          withdrawAll: state.quote.withdrawAll,
          availableSats: state.quote.availableSats,
          exitSpeed: state.exitSpeed,
          feeQuote: state.quote.feeQuote,
          deviceId: device.id,
        })
      )

      if (!executeResult.ok) {
        dispatch({
          type: "CONFIRM_FAILED",
          error: confirmErrorKey(executeResult.error),
        })
        return
      }

      dispatch({
        type: "SHOW_RESULT",
        result: {
          txid: executeResult.value.txid,
          status: executeResult.value.status,
        },
      })
    } finally {
      dispatch({ type: "CONFIRM_FINISHED" })
    }
  }

  return (
    <>
      <div className="h-6" />
      <FadeHeader title={t("settings.withdrawals.title")} />

      {state.step === "form" ? (
        <WithdrawFormStep
          accountId={sparkAccount.id}
          availableSats={availableSats}
          onReview={(address, quote) =>
            dispatch({ type: "OPEN_REVIEW", address, quote })
          }
        />
      ) : null}

      {state.step === "review" ? (
        <WithdrawReviewStep
          address={state.address}
          quote={state.quote}
          exitSpeed={state.exitSpeed}
          confirming={state.confirming}
          confirmError={state.confirmError}
          onExitSpeedChange={(exitSpeed) =>
            dispatch({ type: "SET_EXIT_SPEED", exitSpeed })
          }
          onBack={() => dispatch({ type: "BACK" })}
          onConfirm={() => void confirmWithdrawal()}
          locale={locale}
        />
      ) : null}

      {state.step === "result" ? (
        <WithdrawResultStep result={state.result} />
      ) : null}
    </>
  )
}
