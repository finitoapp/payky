import { formatMoney } from "@payky/app-shared/format-money"
import type { TranslationKey } from "@payky/app-shared/i18n/resources"
import {
  clearPaymentMethodPreparation,
  createPaymentMethodPreparationRunner,
  failPaymentMethodPreparation,
  type PaymentMethodPreparationState,
  requestPaymentMethodPreparation,
  retryPaymentMethodPreparation,
} from "@payky/app-shared/payment-method-preparation"
import { enabledPaymentMethodAccountsQuery } from "@payky/core/modules/account/account-queries"
import {
  cancelPayment,
  markPaymentPaidCash,
} from "@payky/core/modules/payment/payment-actions"
import { preparePaymentMethod } from "@payky/core/modules/payment/payment-preparation-actions"
import {
  paymentClaimsQuery,
  paymentRequestQuery,
} from "@payky/core/modules/payment/payment-queries"
import { derivePaymentStatus } from "@payky/core/modules/payment/payment-status-utils"
import { PaymentId } from "@payky/core/modules/payment/payment-types"
import { Integer } from "@payky/core/modules/shared/schema"
import { router, useLocalSearchParams } from "expo-router"
import { useAtomValue } from "jotai"
import { useEffect, useRef, useState } from "react"
import { ActivityIndicator } from "react-native"
import { Text, YStack } from "tamagui"
import { accountAtom } from "../../atoms/account.ts"
import { AppButton } from "../../components/app-button.tsx"
import { Field } from "../../components/field.tsx"
import { Screen } from "../../components/screen.tsx"
import { EmptyView } from "../../components/state-views.tsx"
import { nativeConsole } from "../../core/native-runtime.ts"
import { useRequirePermission } from "../../core/use-access.ts"
import { useAppRun } from "../../hooks/use-app-run.ts"
import { useEvoluQuery } from "../../hooks/use-evolu-query.ts"
import { useRunToast } from "../../hooks/use-run-toast.ts"
import { useLocale, useTranslation } from "../../hooks/use-translation.ts"
import { readCashReceived } from "./cash-received.ts"

// Cash is the only payment method here; IBAN (P06), Spark (P07) and Cashu
// (P08) add their tabs to this screen, so there is no tab strip yet.

const goHome = () => router.dismissTo("/")

export function PaymentWaitPage() {
  const { t } = useTranslation()
  const { paymentId } = useLocalSearchParams<{ paymentId: string }>()
  const parsed = PaymentId.safeParse(paymentId)
  if (!parsed.success) return <EmptyView message={t("paymentWait.invalidId")} />
  return <PaymentWaitRequest paymentId={parsed.data} />
}

function PaymentWaitRequest({ paymentId }: { readonly paymentId: PaymentId }) {
  const { t } = useTranslation()
  const locale = useLocale()
  const appRun = useAppRun()
  const runToast = useRunToast()
  const { require } = useRequirePermission()
  const deviceId = useAtomValue(accountAtom).device.id
  const [payment] = useEvoluQuery(paymentRequestQuery(paymentId)).data
  const claims = useEvoluQuery(paymentClaimsQuery(paymentId)).data
  const accounts = useEvoluQuery(enabledPaymentMethodAccountsQuery).data
  const [edited, setEdited] = useState<string | null>(null)
  const [errorKey, setErrorKey] = useState<TranslationKey | null>(null)
  const [markPending, setMarkPending] = useState(false)
  const [cancelPending, setCancelPending] = useState(false)
  // Refs close the window before the pending state re-renders, so repeated
  // taps neither stack PIN prompts nor settle or cancel twice.
  const busyRef = useRef(false)
  const [preparation, setPreparation] = useState<PaymentMethodPreparationState>(
    {}
  )
  const [runner] = useState(createPaymentMethodPreparationRunner)

  // The enabled cash register in the payment's currency, like web's tab list.
  const cashAccount = accounts.find(
    (account) =>
      account.kind === "cashRegister" &&
      account.cashRegisterCurrency === payment?.currency
  )
  const preparationKey =
    cashAccount === undefined ? null : `${paymentId}:cash:${cashAccount.id}`
  const prepared =
    payment?.cashRegisterAccountId !== null &&
    payment?.cashRegisterAccountId !== undefined
  const preparationStatus =
    preparationKey === null ? undefined : preparation[preparationKey]
  const status =
    payment === undefined
      ? null
      : derivePaymentStatus({
          canceledAt: payment.canceledAt,
          confirmedPaidAt: payment.confirmedPaidAt,
          // Cash never sets `expiresAt`, so no ticking clock is needed here.
          expiresAt: payment.expiresAt,
          hasActiveClaim: claims.length > 0,
          now: new Date(),
        })

  // Attaches the cash register to the payment once; the runner dedups an
  // in-flight attempt, the state a finished or failed one.
  const prepare = (
    accountId: NonNullable<typeof cashAccount>["id"],
    key: string
  ) =>
    runner.run(key, async () => {
      try {
        await using run = appRun()
        const result = await run(
          preparePaymentMethod({ paymentId, cashRegister: { accountId } })
        )
        if (!result.ok) {
          nativeConsole.error("Failed to prepare cash payment", result.error)
          setPreparation((state) =>
            failPaymentMethodPreparation(state, key, result.error)
          )
        }
      } catch (error) {
        nativeConsole.error("Failed to prepare cash payment", error)
        setPreparation((state) =>
          failPaymentMethodPreparation(state, key, error)
        )
      }
    })

  // `prepare` closes over stable inputs; the preparation state guards re-entry.
  // biome-ignore lint/correctness/useExhaustiveDependencies: see above
  useEffect(() => {
    if (
      status !== "pending" ||
      cashAccount === undefined ||
      preparationKey === null
    )
      return
    if (prepared) {
      setPreparation((state) =>
        clearPaymentMethodPreparation(state, preparationKey)
      )
      return
    }
    const transition = requestPaymentMethodPreparation(
      preparation,
      preparationKey
    )
    if (!transition.shouldPrepare) return
    setPreparation(transition.state)
    void prepare(cashAccount.id, preparationKey)
  }, [status, cashAccount, preparationKey, prepared, preparation])

  if (payment === undefined || status === null)
    return <EmptyView message={t("paymentWait.notFound")} />
  if (status === "canceled") return <Closed messageKey="paymentWait.canceled" />
  if (status === "expired")
    return <Closed messageKey="payment.status.expired" />
  if (status === "paid") return <Paid />

  const cashRegisterAccountId = payment.cashRegisterAccountId
  const { text, leastReceived, receivedAmount } = readCashReceived({
    amount: payment.amount,
    currency: payment.currency,
    edited,
  })
  const formatMinor = (value: number) =>
    formatMoney(
      { value: Integer(value), currency: payment.currency },
      locale
    )
  const canMarkCashPaid =
    cashRegisterAccountId !== null && cashRegisterAccountId !== undefined
  const preparing =
    cashAccount !== undefined &&
    !prepared &&
    preparationStatus?.status !== "failed"

  const markPaid = async () => {
    if (busyRef.current || receivedAmount === null) return
    if (cashRegisterAccountId === null || cashRegisterAccountId === undefined)
      return
    busyRef.current = true
    try {
      if (!(await require("confirm", "access.action.markCashPaid"))) return
      setErrorKey(null)
      setMarkPending(true)
      // A refused settle shows inline; `runToast` only catches the unexpected.
      await runToast(async (run) => {
        const result = await run(
          markPaymentPaidCash({
            paymentId,
            accountId: cashRegisterAccountId,
            deviceId,
            receivedAmount,
          })
        )
        if (!result.ok) {
          nativeConsole.error("Failed to mark cash payment paid", result.error)
          setErrorKey("paymentWait.cashPaid.error")
        }
      })
    } finally {
      setMarkPending(false)
      busyRef.current = false
    }
  }

  const cancel = async () => {
    if (busyRef.current) return
    busyRef.current = true
    try {
      if (!(await require("discard", "access.action.cancelPayment"))) return
      setCancelPending(true)
      await runToast(async (run) => {
        const result = await run(cancelPayment(paymentId))
        if (!result.ok) {
          nativeConsole.error("Failed to cancel payment", result.error)
          return "paymentWait.cancelError"
        }
        // Web returns a bill payment to its cart; bills arrive with P05, until
        // then every payment started here is a plain amount.
        goHome()
      })
    } finally {
      setCancelPending(false)
      busyRef.current = false
    }
  }

  const retryPreparation = () => {
    if (cashAccount === undefined || preparationKey === null || prepared) return
    const transition = retryPaymentMethodPreparation(
      preparation,
      preparationKey
    )
    if (!transition.shouldPrepare) return
    setPreparation(transition.state)
    void prepare(cashAccount.id, preparationKey)
  }

  return (
    <Screen>
      <YStack items="center" gap="2" pt="6">
        <Text color="muted-foreground">{t("paymentWait.pay")}</Text>
        <Text fontSize={36} fontWeight="600" accessibilityRole="header">
          {formatMinor(payment.amount)}
        </Text>
      </YStack>

      {cashAccount === undefined ? (
        <Text color="muted-foreground" text="center">
          {t("paymentWait.missingRequest")}
        </Text>
      ) : preparationStatus?.status === "failed" ? (
        <YStack gap="3" items="center">
          <Text color="red-600" text="center">
            {t("paymentWait.prepareError")}
          </Text>
          <AppButton
            label={t("paymentWait.prepareRetry")}
            variant="secondary"
            onPress={retryPreparation}
          />
        </YStack>
      ) : (
        <YStack gap="3">
          <Text fontWeight="600" text="center">
            {t("paymentWait.cashPaid.prompt")}
          </Text>
          {preparing ? (
            <YStack items="center" gap="2">
              <ActivityIndicator />
              <Text color="muted-foreground">
                {t("paymentWait.preparing.cash")}
              </Text>
            </YStack>
          ) : null}
          <Field
            label={t("paymentWait.cashPaid.received")}
            value={text}
            keyboardType="decimal-pad"
            autoComplete="off"
            disabled={markPending}
            error={
              receivedAmount === null
                ? t("paymentWait.cashPaid.receivedTooLow", {
                    amount: formatMinor(leastReceived),
                  })
                : undefined
            }
            onChangeText={setEdited}
          />
          {receivedAmount !== null && receivedAmount !== payment.amount ? (
            <Text color="muted-foreground">
              {t("paymentWait.cashPaid.difference", {
                amount: formatMinor(receivedAmount - payment.amount),
              })}
            </Text>
          ) : null}
          <AppButton
            label={
              markPending
                ? t("paymentWait.cashPaid.pending")
                : t("paymentWait.cashPaid.action")
            }
            pending={markPending}
            disabled={!canMarkCashPaid || receivedAmount === null}
            onPress={() => void markPaid()}
          />
          {errorKey === null ? null : (
            <Text color="red-600" accessibilityRole="alert">
              {t(errorKey)}
            </Text>
          )}
        </YStack>
      )}

      <AppButton
        label={t("paymentWait.cancel")}
        variant="secondary"
        pending={cancelPending}
        disabled={markPending}
        onPress={() => void cancel()}
      />
    </Screen>
  )
}

/** Canceled or expired: nothing to settle, only the way back. */
function Closed({ messageKey }: { readonly messageKey: TranslationKey }) {
  const { t } = useTranslation()
  return (
    <Screen>
      <EmptyView message={t(messageKey)} />
      <AppButton label={t("paymentWait.back")} onPress={goHome} />
    </Screen>
  )
}

/** Shown from the derived status alone, so a reopened paid payment shows it too. */
function Paid() {
  const { t } = useTranslation()
  return (
    <Screen>
      <EmptyView message={t("paymentWait.paid")} />
      <AppButton label={t("paymentWait.back")} onPress={goHome} />
    </Screen>
  )
}
