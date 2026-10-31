import {
  type CashuWithdrawRequest,
  cashuConfirmOutcome,
  cashuQuoteErrorMessage,
  cashuWithdrawPinDetail,
  fundedMints,
  withdrawMint,
} from "@payky/app-shared/cashu-withdraw-flow"
import {
  createWithdrawDraft,
  draftComment,
} from "@payky/app-shared/withdraw-flow"
import type { AccountId } from "@payky/core/modules/account/account-types"
import type { MintUrl } from "@payky/core/modules/cashu/cashu-types"
import {
  type CashuWithdrawalQuote,
  executeCashuWithdrawal,
  quoteCashuWithdrawal,
} from "@payky/core/modules/withdraw/withdraw-cashu-actions"
import { useNavigate } from "@tanstack/react-router"
import { useStore } from "jotai"
import { useRef, useState } from "react"
import { accountAtom } from "@/atoms/account.ts"
import { FadeHeader } from "@/components/fade-header.tsx"
import { useCashuWallet } from "@/features/shared/cashu/use-cashu-wallet.ts"
import { useAccess, useRequirePermission } from "@/hooks/use-access.ts"
import { useCashuAppRun } from "@/hooks/use-app-run.ts"
import { useLocale } from "@/hooks/use-locale.ts"
import { useTranslation } from "@/hooks/use-translation.ts"
import { CashuWithdrawFormStep } from "./cashu-withdraw-form-step.tsx"
import { CashuWithdrawReviewStep } from "./cashu-withdraw-review-step.tsx"
import {
  useWithdrawAccountId,
  WithdrawNoAccountCard,
} from "./withdraw-account.tsx"
import { withdrawRoutes } from "./withdraw-display.ts"

interface CashuReview {
  readonly request: CashuWithdrawRequest
  readonly quote: CashuWithdrawalQuote
}

/**
 * A Lightning withdrawal from one mint of Payky's Cashu wallet
 * (withdraw/0015): the default mint preselected, an invoice or a Lightning
 * address, a review of the mint's own fees, and the PIN before anything
 * leaves.
 */
export function CashuWithdrawPage({
  initialDestination,
  initialMint = null,
}: {
  readonly initialDestination: string
  /** The mint to withdraw from, as the mint's detail page links it. */
  readonly initialMint?: MintUrl | null
}) {
  const { t } = useTranslation()
  const accountId = useWithdrawAccountId("cashu")

  return (
    <>
      <div className="h-6" />
      <FadeHeader title={t("withdraw.cashu.title")} />
      {accountId === undefined ? (
        <WithdrawNoAccountCard method="cashu" />
      ) : (
        <CashuWithdrawFlow
          accountId={accountId}
          initialDestination={initialDestination}
          initialMint={initialMint}
        />
      )}
    </>
  )
}

function CashuWithdrawFlow({
  accountId,
  initialDestination,
  initialMint,
}: {
  readonly accountId: AccountId
  readonly initialDestination: string
  readonly initialMint: MintUrl | null
}) {
  const cashuAppRun = useCashuAppRun()
  const navigate = useNavigate()
  const access = useAccess()
  const { require, requirePin } = useRequirePermission()
  const jotaiStore = useStore()
  const { t } = useTranslation()
  const locale = useLocale()
  const wallet = useCashuWallet()
  const [draft, setDraft] = useState(() =>
    createWithdrawDraft(initialDestination)
  )
  const [chosenMint, setChosenMint] = useState<MintUrl | null>(initialMint)
  const [review, setReview] = useState<CashuReview | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [requoting, setRequoting] = useState(false)
  const [confirmError, setConfirmError] = useState<string | null>(null)
  // A melt may or may not have happened: nothing is confirmed again from this
  // review until the merchant has gone back (withdraw/0007).
  const [uncertain, setUncertain] = useState(false)
  // `confirming` lags a render behind: a second press before it lands must
  // not melt the same quote twice.
  const confirmingRef = useRef(false)

  const funded = fundedMints(wallet.balances)
  const mint = withdrawMint({
    funded,
    chosen: chosenMint,
    defaultMint: wallet.defaultMint,
  })

  const openDetail = (withdrawalId: string) =>
    navigate({
      to: withdrawRoutes.cashu.detail,
      params: { withdrawalId },
    })

  /** `true` when nothing was melted and the review may be confirmed again. */
  const confirmReviewed = async ({ quote }: CashuReview): Promise<boolean> => {
    setConfirming(true)
    setConfirmError(null)
    // Moving money always asks for the PIN, session or not (access/0007).
    // With access control off there is no PIN, and `require` lets it through.
    const pinDetail = cashuWithdrawPinDetail({ quote, t, locale })
    const allowed = access.enabled
      ? await requirePin("access.action.withdraw", pinDetail)
      : await require("admin", "access.action.withdraw")
    if (!allowed) {
      setConfirming(false)
      return true
    }

    try {
      const { device } = await jotaiStore.get(accountAtom)
      await using run = await cashuAppRun()
      const comment = draftComment(draft)
      const result = await run(
        executeCashuWithdrawal({
          accountId,
          deviceId: device.id,
          quote,
          ...(comment === null ? {} : { comment }),
        })
      )
      const outcome = cashuConfirmOutcome(result, t)
      if (outcome.kind === "recorded") {
        // Sent: its detail follows what the mint does next.
        await openDetail(outcome.withdrawalId)
        return false
      }
      setConfirmError(outcome.message)
      setConfirming(false)
      return true
    } catch {
      // Thrown after the melt may have been submitted is indistinguishable
      // from thrown before it: never offer a retry.
      setUncertain(true)
      setConfirmError(t("withdraw.review.error.uncertain"))
      setConfirming(false)
      return false
    }
  }

  const confirm = async () => {
    if (review === null || confirmingRef.current) return
    confirmingRef.current = true
    // Stays locked after a melt was started: only a retryable end unlocks.
    let retryable = true
    try {
      retryable = await confirmReviewed(review)
    } finally {
      if (retryable) confirmingRef.current = false
    }
  }

  const requote = async () => {
    if (review === null || confirmingRef.current) return
    setRequoting(true)
    setConfirmError(null)
    try {
      await using run = await cashuAppRun()
      const result = await run(quoteCashuWithdrawal(review.request))
      if (result.ok) setReview({ ...review, quote: result.value })
      else setConfirmError(cashuQuoteErrorMessage(result.error, t))
    } catch {
      setConfirmError(t("withdraw.quoteError.generic"))
    } finally {
      setRequoting(false)
    }
  }

  if (review === null) {
    return (
      <CashuWithdrawFormStep
        funded={funded}
        mint={mint}
        onMintChange={setChosenMint}
        draft={draft}
        onDraftChange={setDraft}
        onReview={(request, quote) => {
          setConfirmError(null)
          setReview({ request, quote })
        }}
      />
    )
  }

  return (
    <CashuWithdrawReviewStep
      quote={review.quote}
      comment={draftComment(draft)}
      confirming={confirming}
      requoting={requoting}
      confirmError={confirmError}
      uncertain={uncertain}
      onBack={() => {
        if (confirmingRef.current && !uncertain) return
        setUncertain(false)
        confirmingRef.current = false
        setReview(null)
      }}
      onConfirm={() => void confirm()}
      onNewQuote={() => void requote()}
      onOpenHistory={() => void navigate({ to: withdrawRoutes.cashu.history })}
    />
  )
}
