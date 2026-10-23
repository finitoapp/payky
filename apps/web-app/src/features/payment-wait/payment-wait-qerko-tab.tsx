import {
  describeQerkoPaymentError,
  isQerkoKeyRejected,
  isQerkoStepCancellable,
  qerkoStepKeys,
} from "@payky/app-shared/qerko-terminal-flow"
import { qerkoTerminalSelectionQuery } from "@payky/core/evolu/device-qerko"
import type { QerkoPaymentFailureReason } from "@payky/core/integrations/qerko/qerko-client"
import type { AccountId } from "@payky/core/modules/account/account-types"
import {
  cancelQerkoTerminalPayment,
  type QerkoTerminalPaymentProgress,
  startQerkoTerminalPayment,
  syncQerkoTerminalPayment,
} from "@payky/core/modules/payment/payment-qerko-actions"
import type { PaymentId } from "@payky/core/modules/payment/payment-types"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { useAtomValue } from "jotai"
import { LoaderCircleIcon, NfcIcon } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { accountAtom } from "@/atoms/account.ts"
import { Button } from "@/components/ui/button.tsx"
import { useAppRun } from "@/hooks/use-app-run.ts"
import { useConfirmDialog } from "@/hooks/use-confirm-dialog.ts"
import { useDeviceEvoluQuery } from "@/hooks/use-device-evolu-query.ts"
import { useTranslation } from "@/hooks/use-translation.ts"

type Outcome =
  | {
      readonly kind: "progress"
      readonly progress: QerkoTerminalPaymentProgress
    }
  | {
      readonly kind: "error"
      readonly error: { readonly type: string; readonly reason?: string }
    }

/**
 * Taking the payment on the Qerko terminal this device chose. The attempt
 * lives in the payment's own row (`pendingTransactionId`, `unresolved…`), so
 * this tab only draws what is there and polls while one is pending; the
 * background job settles it too, which is why closing this screen mid-payment
 * loses nothing (qerko/0005).
 */
export function QerkoPaymentTab({
  paymentId,
  accountId,
  payable,
  pendingTransactionId,
  unresolvedTransactionId,
  failureReason,
}: {
  readonly paymentId: PaymentId
  readonly accountId: AccountId | null | undefined
  /** The payment is still waiting for money. */
  readonly payable: boolean
  readonly pendingTransactionId: string | null | undefined
  readonly unresolvedTransactionId: string | null | undefined
  /** Why the last attempt ended without money, when it did. */
  readonly failureReason: QerkoPaymentFailureReason | null | undefined
}) {
  const { t } = useTranslation()
  const appRun = useAppRun()
  const confirm = useConfirmDialog()
  const queryClient = useQueryClient()
  const account = useAtomValue(accountAtom)
  const { data: selectionData } = useDeviceEvoluQuery(
    qerkoTerminalSelectionQuery(account.id)
  )
  const [selection] = selectionData
  const [starting, setStarting] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [startErrorKey, setStartErrorKey] = useState<ReturnType<
    typeof describeQerkoPaymentError
  > | null>(null)
  // The method is prepared when its tab opens; until then there is no
  // account to start the payment with.
  const prepared = accountId !== null && accountId !== undefined
  const pending =
    pendingTransactionId !== null && pendingTransactionId !== undefined
  const unresolved =
    unresolvedTransactionId !== null && unresolvedTransactionId !== undefined
  const pollKey = ["qerko", "payment-sync", paymentId]

  // One poll a second while the attempt is pending and this screen is open.
  const poll = useQuery({
    queryKey: pollKey,
    enabled: pending,
    refetchInterval: 1000,
    queryFn: async (): Promise<Outcome> => {
      await using run = appRun()
      const result = await run(
        syncQerkoTerminalPayment({ paymentId, deviceId: account.device.id })
      )
      return result.ok
        ? { kind: "progress", progress: result.value }
        : { kind: "error", error: result.error }
    },
  })

  const start = async () => {
    if (accountId === null || accountId === undefined) return
    if (selection === undefined) return

    if (unresolved) {
      const confirmed = await confirm({
        title: t("paymentWait.qerko.retryUnresolved.title"),
        description: t("paymentWait.qerko.retryUnresolved.description"),
        confirmLabel: t("paymentWait.qerko.retryUnresolved.confirm"),
        cancelLabel: t("paymentWait.qerko.retryUnresolved.cancel"),
        variant: "destructive",
      })
      if (!confirmed) return
    }

    setStartErrorKey(null)
    queryClient.removeQueries({ queryKey: pollKey })
    setStarting(true)
    await using run = appRun()
    const result = await run(
      startQerkoTerminalPayment({
        paymentId,
        accountId,
        terminalId: selection.terminalId,
        deviceId: account.device.id,
        retryUnresolved: unresolved,
      })
    )
    setStarting(false)
    if (!result.ok) setStartErrorKey(describeQerkoPaymentError(result.error))
  }

  const cancel = async () => {
    setCancelling(true)
    await using run = appRun()
    const result = await run(cancelQerkoTerminalPayment(paymentId))
    setCancelling(false)
    if (!result.ok) {
      toast.error(t(describeQerkoPaymentError(result.error)))
    } else if (result.value === "notCancellable") {
      toast.error(t("paymentWait.qerko.cancel.notCancellable"))
    }
  }

  const outcome = poll.data
  const step =
    outcome?.kind === "progress" && outcome.progress.status === "pending"
      ? outcome.progress.step
      : "connecting"
  // The last attempt's failure is on the payment's row, not in this poll's
  // answer: the background job may have been the one to read it.
  const failureKey =
    failureReason === null || failureReason === undefined
      ? null
      : describeQerkoPaymentError({
          type: "QerkoTerminalPaymentFailed",
          reason: failureReason,
        })
  // A refused key shows even while an attempt is pending: nothing else will
  // ever move that attempt along.
  const rejectedKey =
    outcome?.kind === "error" && isQerkoKeyRejected(outcome.error)
      ? describeQerkoPaymentError(outcome.error)
      : null
  const errorKey = startErrorKey ?? rejectedKey ?? failureKey
  const settingsLink =
    errorKey === "paymentWait.qerko.error.keyRejected" ? (
      <Link
        to="/settings/payment-accounts/qerko-terminal"
        className="text-sm font-medium underline"
      >
        {t("paymentWait.qerko.error.keyRejected.link")}
      </Link>
    ) : null

  if (selection === undefined) {
    return (
      <div className="flex w-full flex-col items-center gap-2 py-4">
        <p className="max-w-72 text-balance text-sm text-muted-foreground">
          {t("paymentWait.qerko.noTerminal")}
        </p>
        <Link
          to="/settings/payment-accounts/qerko-terminal"
          className="text-sm font-medium underline"
        >
          {t("paymentWait.qerko.noTerminal.link")}
        </Link>
      </div>
    )
  }

  if (pending) {
    return (
      <div className="flex w-full flex-col items-center gap-3 py-4">
        <p
          className="flex items-center gap-2 text-sm font-medium"
          aria-live="polite"
        >
          <LoaderCircleIcon className="size-4 animate-spin" />
          {t(qerkoStepKeys[step])}
        </p>
        {isQerkoStepCancellable(step) ? (
          <Button
            type="button"
            variant="outline"
            disabled={cancelling}
            onClick={() => {
              void cancel()
            }}
          >
            {t("paymentWait.qerko.cancel")}
          </Button>
        ) : null}
        {rejectedKey === null ? null : (
          <p className="max-w-72 text-balance text-sm font-medium text-destructive">
            {t(rejectedKey)}
          </p>
        )}
        {settingsLink}
      </div>
    )
  }

  return (
    <div className="flex w-full flex-col items-center gap-2 py-4">
      <Button
        type="button"
        size="lg"
        disabled={!payable || !prepared || starting}
        onClick={() => {
          void start()
        }}
        className="h-14 px-8 text-base"
      >
        {starting ? <LoaderCircleIcon className="animate-spin" /> : <NfcIcon />}
        {t(unresolved ? "paymentWait.qerko.retry" : "paymentWait.qerko.action")}
      </Button>
      {unresolved ? (
        <p className="max-w-72 text-balance text-sm font-medium text-destructive">
          {t("paymentWait.qerko.unresolved")}
        </p>
      ) : null}
      {errorKey !== null && !unresolved ? (
        <p className="max-w-72 text-balance text-sm font-medium text-destructive">
          {t(errorKey)}
        </p>
      ) : null}
      {unresolved ? null : settingsLink}
    </div>
  )
}
