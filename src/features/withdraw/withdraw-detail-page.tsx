import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { useAtomValue } from "jotai"
import { CopyIcon, ExternalLinkIcon } from "lucide-react"
import type { ReactNode } from "react"

import { accountAtom } from "@/atoms/account.ts"
import { DetailRow } from "@/components/detail-row.tsx"
import { NotFoundCard } from "@/components/not-found-card.tsx"
import { Button } from "@/components/ui/button.tsx"
import { Card, CardContent } from "@/components/ui/card.tsx"
import { activeSparkAccountByIdQuery } from "@/core/modules/account/account-spark-queries.ts"
import type { AccountId } from "@/core/modules/account/account-types.ts"
import { TimestampMs } from "@/core/modules/shared/schema.ts"
import {
  confirmOnchainWithdrawalSent,
  markWithdrawalFailed,
} from "@/core/modules/withdraw/withdraw-actions.ts"
import {
  toWithdrawalView,
  type WithdrawalView,
  withdrawalDetailQuery,
} from "@/core/modules/withdraw/withdraw-queries.ts"
import { WithdrawalId } from "@/core/modules/withdraw/withdraw-types.ts"
import {
  WITHDRAWAL_CHECK_WINDOW_MS,
  WITHDRAWAL_SEND_TIMEOUT_MS,
  WITHDRAWAL_SEND_TIMEOUT_OTHER_DEVICE_MS,
} from "@/core/modules/withdraw/withdraw-utils.ts"
import { useRequirePermission } from "@/hooks/use-access.ts"
import { useAppRun } from "@/hooks/use-app-run.ts"
import { useConfirmDialog } from "@/hooks/use-confirm-dialog.ts"
import { useEvoluQuery } from "@/hooks/use-evolu-query.ts"
import { useLocale } from "@/hooks/use-locale.ts"
import { useNow } from "@/hooks/use-now.ts"
import { useRunToast } from "@/hooks/use-run-toast.ts"
import { useTranslation } from "@/hooks/use-translation.ts"
import type { TranslationKey } from "@/i18n/resources.ts"
import { copyToClipboard } from "@/lib/clipboard.ts"
import { formatDateTime, formatSatsAmount } from "@/lib/format-utils.ts"
import { useSparkBalance } from "./use-spark-balance.ts"
import { WithdrawCollapsible } from "./withdraw-collapsible.tsx"
import {
  reusableWithdrawalDestination,
  withdrawalKindKeys,
} from "./withdraw-display.ts"
import { SatsWithFiat } from "./withdraw-sats.tsx"
import { WithdrawalStatusBadge } from "./withdraw-status-badge.tsx"

const TXID_REFETCH_INTERVAL_MS = 30_000

type FailureReason = Extract<
  WithdrawalView["state"],
  { status: "failed" }
>["reason"]

const failureKeys = {
  manual: "withdraw.detail.failed.manual",
  rejected: "withdraw.detail.failed.rejected",
  returned: "withdraw.detail.failed.returned",
  "not-created": "withdraw.detail.failed.notCreated",
} satisfies Record<FailureReason, TranslationKey>

export function WithdrawDetail({
  withdrawalId,
}: {
  readonly withdrawalId: string
}) {
  const parsed = WithdrawalId.safeParse(withdrawalId)
  if (!parsed.success) {
    return <NotFoundCard messageKey="withdraw.detail.notFound" />
  }
  return <WithdrawDetailContent withdrawalId={parsed.data} />
}

function WithdrawDetailContent({
  withdrawalId,
}: {
  readonly withdrawalId: WithdrawalId
}) {
  const { data } = useEvoluQuery(withdrawalDetailQuery(withdrawalId))
  const [row] = data
  const view = row === undefined ? null : toWithdrawalView(row)
  if (view === null) {
    return <NotFoundCard messageKey="withdraw.detail.notFound" />
  }
  return (
    <div className="flex flex-col gap-4">
      <WithdrawalStatusCard view={view} />
      <WithdrawalDetailsCard view={view} />
    </div>
  )
}

function CopyableValue({ value }: { readonly value: string }) {
  const { t } = useTranslation()
  return (
    <span className="flex items-start gap-2">
      <span className="min-w-0 flex-1 break-all font-mono text-xs">
        {value}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={t("withdraw.detail.copy")}
        onClick={() =>
          void copyToClipboard(value, {
            copied: t("withdraw.detail.copied"),
            failed: t("withdraw.detail.copyError"),
          })
        }
      >
        <CopyIcon />
      </Button>
    </span>
  )
}

/**
 * The pending Lightning text: the creating device promises ten minutes, any
 * other one a day; past that the transfer exists and only waits; past the
 * check window nobody is watching any more (withdraw/0003, withdraw/0007).
 */
const usePendingLightningText = (view: WithdrawalView): string => {
  const { t } = useTranslation()
  const { device } = useAtomValue(accountAtom)
  const ownDevice = view.deviceId !== null && view.deviceId === device.id
  const timeoutAt =
    view.createdAt +
    (ownDevice
      ? WITHDRAWAL_SEND_TIMEOUT_MS
      : WITHDRAWAL_SEND_TIMEOUT_OTHER_DEVICE_MS)
  const windowEndsAt = view.createdAt + WITHDRAWAL_CHECK_WINDOW_MS
  const now = useNow([TimestampMs(timeoutAt), TimestampMs(windowEndsAt)])

  if (now.getTime() >= windowEndsAt) return t("withdraw.detail.pending.unknown")
  if (now.getTime() >= timeoutAt) return t("withdraw.detail.pending.processing")
  if (ownDevice) return t("withdraw.detail.pending.ownDevice")
  return view.deviceName === null
    ? t("withdraw.detail.pending.unknownDevice")
    : t("withdraw.detail.pending.otherDevice", { device: view.deviceName })
}

function PendingLightningText({ view }: { readonly view: WithdrawalView }) {
  return <p className="text-sm">{usePendingLightningText(view)}</p>
}

function NewWithdrawalButton({ view }: { readonly view: WithdrawalView }) {
  const { t } = useTranslation()
  const destination = reusableWithdrawalDestination(view.target)
  return (
    <>
      {destination === null ? (
        <p className="text-sm text-muted-foreground">
          {t("withdraw.detail.invoiceRenewHint")}
        </p>
      ) : null}
      <Button
        className="w-fit"
        nativeButton={false}
        render={
          <Link
            to="/settings/payment-accounts/spark/withdrawals/new"
            search={destination === null ? {} : { destination }}
          />
        }
      >
        {t("withdraw.detail.newWithdrawal")}
      </Button>
    </>
  )
}

/**
 * "The money did not leave" / "The money left" for an on-chain withdrawal
 * whose outcome is not certain (withdraw/0002). Neither moves money, so the
 * owner's ordinary `admin` gate is enough.
 */
function OnchainResolutionButtons({
  view,
  offerNotSent,
}: {
  readonly view: WithdrawalView
  readonly offerNotSent: boolean
}) {
  const { t } = useTranslation()
  const locale = useLocale()
  const { require } = useRequirePermission()
  const confirm = useConfirmDialog()
  const runToast = useRunToast()
  const { device } = useAtomValue(accountAtom)
  const balance = useSparkBalance(view.accountId)
  if (view.target.kind !== "onchain") return null
  const debited = formatSatsAmount(
    view.amountSats + view.target.quotedFeeSats,
    locale
  )

  const resolve = async (sent: boolean) => {
    if (!(await require("admin", "access.action.withdraw"))) return
    const confirmed = await confirm({
      title: t(
        sent
          ? "withdraw.detail.markSent.title"
          : "withdraw.detail.markNotSent.title"
      ),
      description: sent
        ? t("withdraw.detail.markSent.description", { amount: debited })
        : t("withdraw.detail.markNotSent.description", { amount: debited }),
      confirmLabel: t(
        sent ? "withdraw.detail.markSent" : "withdraw.detail.markNotSent"
      ),
      cancelLabel: t("withdraw.detail.cancel"),
    })
    if (!confirmed) return
    await runToast(async (run) => {
      if (sent) {
        await run.orThrow(
          confirmOnchainWithdrawalSent({
            withdrawalId: view.id,
            deviceId: device.id,
          })
        )
      } else {
        await run.ok(
          markWithdrawalFailed({ withdrawalId: view.id, reason: "manual" })
        )
      }
    })
  }

  return (
    <div className="flex flex-col gap-2">
      {balance !== null ? (
        <p className="text-sm text-muted-foreground">
          {t("withdraw.detail.balanceNow", {
            balance: formatSatsAmount(balance, locale),
            amount: debited,
          })}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {offerNotSent ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => void resolve(false)}
          >
            {t("withdraw.detail.markNotSent")}
          </Button>
        ) : null}
        <Button
          type="button"
          variant="outline"
          onClick={() => void resolve(true)}
        >
          {t("withdraw.detail.markSent")}
        </Button>
      </div>
    </div>
  )
}

function WithdrawalStatusCard({ view }: { readonly view: WithdrawalView }) {
  const { t } = useTranslation()
  const locale = useLocale()
  const { state, target } = view
  let body: ReactNode

  if (state.status === "pending") {
    body =
      target.kind === "lightning" ? (
        <PendingLightningText view={view} />
      ) : (
        <>
          <p className="text-sm">{t("withdraw.detail.onchainUncertain")}</p>
          <OnchainResolutionButtons view={view} offerNotSent />
        </>
      )
  } else if (state.status === "failed") {
    body = (
      <>
        <p className="text-sm">{t(failureKeys[state.reason])}</p>
        {state.reason === "not-created" ? (
          // Derived from time, not confirmed: a new withdrawal to the same
          // Lightning address could pay twice (withdraw/0007).
          <p className="text-sm text-muted-foreground">
            {t("withdraw.detail.failed.notCreatedHint")}
          </p>
        ) : (
          <NewWithdrawalButton view={view} />
        )}
        {state.reason === "manual" ? (
          <OnchainResolutionButtons view={view} offerNotSent={false} />
        ) : null}
      </>
    )
  } else {
    body = (
      <>
        {target.kind === "onchain" && state.coopExitRequestId === null ? (
          <p className="text-sm text-muted-foreground">
            {t("withdraw.detail.manualConfirmed")}
          </p>
        ) : null}
        {state.movementDeleted ? (
          <p className="text-sm text-muted-foreground">
            {t("withdraw.detail.movementDeleted")}
          </p>
        ) : null}
      </>
    )
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-2">
          <span className="text-xl font-semibold">
            <SatsWithFiat
              sats={view.amountSats}
              locale={locale}
              align="start"
            />
          </span>
          <WithdrawalStatusBadge view={view} />
        </div>
        {body}
      </CardContent>
    </Card>
  )
}

/**
 * The on-chain txid the withdrawal action recorded is often still `null`
 * (the SDK returns before broadcasting) and nobody writes it later, so the
 * detail reads it from the SDK for display only (withdraw/0002).
 */
function OnchainTxid({
  accountId,
  txid,
  coopExitRequestId,
}: {
  readonly accountId: AccountId
  readonly txid: string | null
  readonly coopExitRequestId: string | null
}) {
  const { t } = useTranslation()
  const appRun = useAppRun()
  const { data: sparkAccounts } = useEvoluQuery(
    activeSparkAccountByIdQuery(accountId)
  )
  const [sparkAccount] = sparkAccounts
  const txidQuery = useQuery({
    queryKey: ["withdraw", "coop-exit-txid", coopExitRequestId],
    queryFn: async () => {
      if (coopExitRequestId === null || sparkAccount === undefined) return null
      await using run = appRun()
      await using wallet = await run.deps.sparkWallet.create(
        sparkAccount.secret
      )
      return (await wallet.getCoopExitRequest(coopExitRequestId))?.txid ?? null
    },
    enabled:
      txid === null && coopExitRequestId !== null && sparkAccount !== undefined,
    // The SSP broadcasts after the withdrawal returns: keep asking until the
    // txid shows up, then stop.
    refetchInterval: (query) =>
      query.state.data === null || query.state.data === undefined
        ? TXID_REFETCH_INTERVAL_MS
        : false,
  })
  const shown = txid ?? txidQuery.data ?? null

  if (coopExitRequestId === null && txid === null) return null

  return (
    <DetailRow label={t("withdraw.detail.txid")} stacked>
      {shown !== null ? (
        <span className="flex flex-col gap-2">
          <CopyableValue value={shown} />
          <a
            className="flex w-fit items-center gap-1 text-xs underline"
            href={`https://mempool.space/tx/${shown}`}
            target="_blank"
            rel="noreferrer"
          >
            <ExternalLinkIcon className="size-3" />
            {t("withdraw.detail.viewOnExplorer")}
          </a>
        </span>
      ) : (
        <span className="text-muted-foreground">
          {txidQuery.isError
            ? t("withdraw.detail.txidError")
            : t("withdraw.detail.txidPending")}
        </span>
      )}
    </DetailRow>
  )
}

function WithdrawalDetailsCard({ view }: { readonly view: WithdrawalView }) {
  const { t } = useTranslation()
  const locale = useLocale()
  const { state, target } = view
  const feeSats =
    state.status === "done"
      ? state.feeSats
      : target.kind === "onchain"
        ? target.quotedFeeSats
        : target.maxFeeSats
  const isMaxFee = state.status !== "done" && target.kind === "lightning"

  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <DetailRow label={t("withdraw.detail.type")}>
          {t(withdrawalKindKeys[target.kind])}
        </DetailRow>
        {target.kind === "onchain" ? (
          <DetailRow label={t("withdraw.detail.destination")} stacked>
            <CopyableValue value={target.onchainAddress} />
          </DetailRow>
        ) : (
          <DetailRow label={t("withdraw.detail.destination")}>
            {target.lightningAddress ??
              t("withdraw.destination.kind.lightningInvoice")}
          </DetailRow>
        )}
        <DetailRow label={t("withdraw.detail.amount")}>
          <SatsWithFiat sats={view.amountSats} locale={locale} />
        </DetailRow>
        <DetailRow
          label={t(isMaxFee ? "withdraw.detail.maxFee" : "withdraw.detail.fee")}
        >
          <SatsWithFiat sats={feeSats} locale={locale} />
        </DetailRow>
        <DetailRow label={t("withdraw.detail.total")} emphasize>
          <SatsWithFiat
            sats={
              state.status === "done"
                ? state.debitedSats
                : view.amountSats + feeSats
            }
            locale={locale}
          />
        </DetailRow>
        <DetailRow label={t("withdraw.detail.date")}>
          {formatDateTime(new Date(view.createdAt), locale)}
        </DetailRow>
        {view.deviceName !== null ? (
          <DetailRow
            label={t("withdraw.detail.device")}
            value={view.deviceName}
          />
        ) : null}
        {state.status === "done" && target.kind === "onchain" ? (
          <OnchainTxid
            accountId={view.accountId}
            txid={state.txid}
            coopExitRequestId={state.coopExitRequestId}
          />
        ) : null}
        {target.kind === "lightning" ? (
          <WithdrawCollapsible label={t("withdraw.detail.technical")}>
            <DetailRow label={t("withdraw.detail.invoice")} stacked>
              <CopyableValue value={target.lnInvoice} />
            </DetailRow>
            {state.status === "done" && state.preImage !== null ? (
              <DetailRow label={t("withdraw.detail.preimage")} stacked>
                <CopyableValue value={state.preImage} />
              </DetailRow>
            ) : null}
            <DetailRow label={t("withdraw.detail.sparkTransferId")} stacked>
              <CopyableValue value={target.sparkTransferId} />
            </DetailRow>
          </WithdrawCollapsible>
        ) : null}
      </CardContent>
    </Card>
  )
}
