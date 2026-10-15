import type { AbortError } from "@evolu/common"
import { useNavigate } from "@tanstack/react-router"
import { useStore } from "jotai"
import { useRef, useState } from "react"

import { accountAtom } from "@/atoms/account.ts"
import { FadeHeader } from "@/components/fade-header.tsx"
import type { AccountId } from "@/core/modules/account/account-types.ts"
import type { MintUrl } from "@/core/modules/cashu/cashu-types.ts"
import {
  type CashuWithdrawalQuote,
  type ExecuteCashuWithdrawalError,
  executeCashuWithdrawal,
  quoteCashuWithdrawal,
} from "@/core/modules/withdraw/withdraw-cashu-actions.ts"
import { useCashuWallet } from "@/features/shared/cashu/use-cashu-wallet.ts"
import { useAccess, useRequirePermission } from "@/hooks/use-access.ts"
import { useAppRun } from "@/hooks/use-app-run.ts"
import { useLocale } from "@/hooks/use-locale.ts"
import { useTranslation } from "@/hooks/use-translation.ts"
import type { TranslationKey } from "@/i18n/resources.ts"
import { formatSatsAmount } from "@/lib/format-utils.ts"
import {
  CashuWithdrawFormStep,
  type CashuWithdrawRequest,
  cashuQuoteErrorKeys,
} from "./cashu-withdraw-form-step.tsx"
import { CashuWithdrawReviewStep } from "./cashu-withdraw-review-step.tsx"
import {
  useWithdrawAccountId,
  WithdrawNoAccountCard,
} from "./withdraw-account.tsx"
import { withdrawRoutes } from "./withdraw-display.ts"
import { createWithdrawDraft, draftComment } from "./withdraw-flow.ts"

/** Refused before the melt was sent: the review stays open and says why. */
const earlyConfirmErrorKeys = {
  AbortError: "withdraw.review.error.interrupted",
  MintUnreachable: "withdraw.cashu.error.unreachable",
  MintRejected: "withdraw.cashu.error.rejected",
  CounterLockTimeout: "withdraw.cashu.error.unreachable",
  QuoteExpired: "withdraw.error.quoteExpired",
  CashuInsufficientFunds: "withdraw.cashu.error.insufficient",
  CashuMeltQuoteNotPayable: "withdraw.cashu.error.rejected",
  CashuMeltUnpaid: "withdraw.cashu.error.rejected",
  CashuMeltPending: "withdraw.detail.pending.cashu",
  CashuWithdrawalDestinationUnsupported: "withdraw.cashu.error.destination",
} satisfies Record<
  Exclude<
    (ExecuteCashuWithdrawalError | AbortError)["type"],
    "WithdrawalRejected" | "WithdrawalOutcomeUnknown"
  >,
  TranslationKey
>

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
  const appRun = useAppRun()
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

  const funded = [...(snapshot?.balances ?? new Map<MintUrl, number>())]
    .filter(([, balance]) => balance > 0)
    .toSorted(([a], [b]) => a.localeCompare(b))
  const mint =
    chosenMint ??
    (funded.some(([candidate]) => candidate === snapshot?.defaultMint)
      ? (snapshot?.defaultMint ?? null)
      : (funded[0]?.[0] ?? null))

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
    const pinDetail = t("withdraw.review.pinDetail", {
      amount: formatSatsAmount(quote.amountSats, locale),
      destination:
        quote.lightningAddress ??
        t("withdraw.destination.kind.lightningInvoice"),
    })
    const allowed = access.enabled
      ? await requirePin("access.action.withdraw", pinDetail)
      : await require("admin", "access.action.withdraw")
    if (!allowed) {
      setConfirming(false)
      return
    }

    try {
      const { device } = await jotaiStore.get(accountAtom)
      await using run = appRun()
      const comment = draftComment(draft)
      const result = await run(
        executeCashuWithdrawal({
          accountId,
          deviceId: device.id,
          quote,
          ...(comment === null ? {} : { comment }),
        })
      )
      if (result.ok) {
        await openDetail(result.value.withdrawalId)
        return
      }
      // Sent: its detail follows what the mint does next.
      if (
        result.error.type === "WithdrawalRejected" ||
        result.error.type === "WithdrawalOutcomeUnknown"
      ) {
        await openDetail(result.error.withdrawalId)
        return
      }
      setConfirmError(t(earlyConfirmErrorKeys[result.error.type]))
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
      await using run = appRun()
      const result = await run(quoteCashuWithdrawal(review.request))
      if (result.ok) setReview({ ...review, quote: result.value })
      else setConfirmError(t(cashuQuoteErrorKeys[result.error.type]))
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
