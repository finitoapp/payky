import type { Result } from "@evolu/common"
import { createDateDep } from "@payky/core/deps"
import { saveCashRegisterAccount } from "@payky/core/modules/account/account-actions"
import { cashRegisterAccountQuery } from "@payky/core/modules/account/account-queries"
import {
  createPayment,
  markPaymentPaidCash,
} from "@payky/core/modules/payment/payment-actions"
import { roundCashAmount } from "@payky/core/modules/payment/payment-cash-utils"
import {
  latestPaymentsQuery,
  paymentReconciliationsQuery,
} from "@payky/core/modules/payment/payment-queries"
import { derivePaymentStatus } from "@payky/core/modules/payment/payment-status-utils"
import { NonNegativeInteger } from "@payky/core/modules/shared/schema"
import { useAtomValue, useStore } from "jotai"
import { useState } from "react"
import { Text, View } from "tamagui"
import { accountAtom } from "../../atoms/account.ts"
import { evoluAtom } from "../../atoms/evolu.ts"
import { evoluCounterAtom } from "../../atoms/evolu-counter.ts"
import { Button } from "../../components/ui/button.tsx"
import { nativeRun } from "../../core/native-runtime.ts"
import { useRequirePermission } from "../../core/use-access.ts"
import { useEvoluQuery } from "../../hooks/use-evolu-query.ts"

const money = (minor: number, currency: string) =>
  `${(minor / 100).toFixed(2)} ${currency}`

const latestQuery = latestPaymentsQuery(1)

/** The newest payment, read from the database, so it survives a restart. */
function LatestPayment({
  payment,
}: {
  readonly payment: ReturnType<typeof useLatest>[number]
}) {
  const claims = useEvoluQuery(paymentReconciliationsQuery(payment.id)).data
  const status = derivePaymentStatus({
    canceledAt: payment.canceledAt,
    confirmedPaidAt: payment.confirmedPaidAt,
    expiresAt: payment.expiresAt,
    hasActiveClaim: claims.length > 0,
    now: new Date(),
  })
  return (
    <>
      <Text>Payment: {payment.id.slice(0, 8)}</Text>
      <Text>Amount: {money(payment.amount, payment.currency)}</Text>
      <Text>Status (derived): {status}</Text>
      <Text>Claims: {claims.length}</Text>
    </>
  )
}

const useLatest = () => useEvoluQuery(latestQuery).data

export function CashSaleCard() {
  const account = useAtomValue(accountAtom)
  const evolu = useAtomValue(evoluAtom)
  const { require } = useRequirePermission()
  const store = useStore()
  const accountVersion = useAtomValue(evoluCounterAtom)
  const isCurrentAccount = () => store.get(evoluCounterAtom) === accountVersion
  const latest = useLatest()[0]
  const cashAccount = useEvoluQuery(cashRegisterAccountQuery).data[0]
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")

  // One short run per action; every Result is shown, never discarded.
  const act = async (task: () => Promise<string>) => {
    if (busy) return
    setBusy(true)
    try {
      setMessage(await task())
    } catch (error) {
      setMessage(`Unexpected: ${String(error)}`)
    } finally {
      setBusy(false)
    }
  }
  const describe = (result: Result<unknown, { type: string }>) =>
    result.ok
      ? "ok"
      : `error ${result.error.type}: ${JSON.stringify(result.error)}`

  const create = () =>
    act(async () => {
      if (!isCurrentAccount()) return ""
      if (
        !(await require("admin", "settings.cashRegisterAccount.enabled.label"))
      )
        return ""
      if (!isCurrentAccount()) return ""
      if (!(await require("sell", "paymentTip.continue"))) return ""
      if (!isCurrentAccount()) return ""
      await using run = nativeRun.create({
        evolu,
        evoluOwner: evolu.appOwner,
        ...createDateDep(),
      })
      const accountId = await run(
        saveCashRegisterAccount({ enabled: true, currency: "CZK" })
      )
      if (!accountId.ok) return `account failed`
      if (accountId.value === null) return "cash account not created"
      if (!isCurrentAccount()) return ""
      const created = await run(
        createPayment({
          deviceId: account.device.id,
          billId: null,
          tableId: null,
          amount: NonNegativeInteger(12345),
          currency: "CZK",
          tipAmount: NonNegativeInteger(0),
          canceledAt: null,
          expiresAt: null,
          cashRegister: { accountId: accountId.value },
        })
      )
      return created.ok ? "payment created" : describe(created)
    })

  const pay = (receivedAmount: number) =>
    act(async () => {
      if (!latest || !cashAccount) return "create a payment first"
      if (!isCurrentAccount()) return ""
      if (!(await require("confirm", "access.action.markCashPaid"))) return ""
      if (!isCurrentAccount()) return ""
      await using run = nativeRun.create({
        evolu,
        evoluOwner: evolu.appOwner,
        ...createDateDep(),
      })
      const result = await run(
        markPaymentPaidCash({
          paymentId: latest.id,
          accountId: cashAccount.id,
          deviceId: account.device.id,
          receivedAmount: NonNegativeInteger(receivedAmount),
        })
      )
      return describe(result)
    })

  const minimum = latest
    ? roundCashAmount({ amount: latest.amount, currency: latest.currency })
    : null

  return (
    <View gap="2">
      <Text fontWeight="600">Diagnostic cash sale</Text>
      {latest ? (
        <LatestPayment payment={latest} />
      ) : (
        <Text>No payment yet</Text>
      )}
      {minimum === null ? null : (
        <Text>Least received: {money(minimum, latest?.currency ?? "")}</Text>
      )}
      <Text accessibilityLiveRegion="polite">
        Last action: {message || "-"}
      </Text>
      <Button variant="outline" disabled={busy} onPress={create}>
        Create payment 123.45 CZK
      </Button>
      <Button variant="outline" disabled={busy} onPress={() => pay(12000)}>
        Try underpayment 120.00
      </Button>
      <Button variant="outline" disabled={busy} onPress={() => pay(12300)}>
        Settle 123.00 cash
      </Button>
    </View>
  )
}
