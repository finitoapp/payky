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
 * A Lightning withdrawal from one mint of the wallet shared with Linky
 * (cashu.md §6): the default mint preselected, an invoice or a Lightning
 * address, a review of the mint's own fees, and the PIN before anything
 * leaves.
 */
export function CashuWithdrawPage({
  initialDestination,
}: {
  readonly initialDestination: string
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
        />
      )}
    </>
  )
}

function CashuWithdrawFlow({
  accountId,
  initialDestination,
}: {
  readonly accountId: AccountId
  readonly initialDestination: string
}) {
  const cashuAppRun = useCashuAppRun()
  const navigate = useNavigate()
  const access = useAccess()
  const { require, requirePin } = useRequirePermission()
  const jotaiStore = useStore()
  const { t } = useTranslation()
  const locale = useLocale()
  const { snapshot } = useCashuWallet()
  const [draft, setDraft] = useState(() =>
    createWithdrawDraft(initialDestination)
  )
  const [chosenMint, setChosenMint] = useState<MintUrl | null>(null)
  const [review, setReview] = useState<CashuReview | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [requoting, setRequoting] = useState(false)
  const [confirmError, setConfirmError] = useState<string | null>(null)
  // `confirming` lags a render behind: a second press before it lands must
  // not melt the same quote twice.
  const confirmingRef = useRef(false)

  const funded = fundedMints(snapshot?.balances ?? new Map<MintUrl, number>())
  const mint = withdrawMint({
    funded,
    chosen: chosenMint,
    defaultMint: snapshot?.defaultMint ?? null,
  })

  const openDetail = (withdrawalId: string) =>
    navigate({
      to: withdrawRoutes.cashu.detail,
      params: { withdrawalId },
    })

  const confirmReviewed = async ({ quote }: CashuReview) => {
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
      return
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
        return
      }
      setConfirmError(outcome.message)
    } catch {
      setConfirmError(t("withdraw.review.error.generic"))
    }
    setConfirming(false)
  }

  const confirm = async () => {
    if (review === null || confirmingRef.current) return
    confirmingRef.current = true
    try {
      await confirmReviewed(review)
    } finally {
      confirmingRef.current = false
    }
  }

  const requote = async () => {
    if (review === null) return
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
      onBack={() => setReview(null)}
      onConfirm={() => void confirm()}
      onNewQuote={() => void requote()}
    />
  )
}
