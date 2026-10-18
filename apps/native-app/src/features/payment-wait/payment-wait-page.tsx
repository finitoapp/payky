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
import { useNow } from "@payky/app-shared/use-now"
import { buildCashuPaymentUri } from "@payky/core/cashu/cashu-payment-request"
import {
  fetchNostrProfile,
  getNostrIdentity,
} from "@payky/core/integrations/nostr/nostr-client"
import { enabledPaymentMethodAccountsQuery } from "@payky/core/modules/account/account-queries"
import type {
  AccountId,
  BankQrFormat,
} from "@payky/core/modules/account/account-types"
import { settingsQuery } from "@payky/core/modules/app-settings/app-settings-queries"
import { getPaymentMethodOrder } from "@payky/core/modules/app-settings/app-settings-utils"
import {
  cancelPayment,
  markPaymentPaidCash,
  markPaymentPaidIban,
} from "@payky/core/modules/payment/payment-actions"
import {
  type BankQrPayload,
  createBankQrPayloads,
} from "@payky/core/modules/payment/payment-iban-qr-payload-utils"
import {
  prepareCashuPaymentMethod,
  preparePaymentMethod,
} from "@payky/core/modules/payment/payment-preparation-actions"
import {
  paymentClaimsQuery,
  paymentRequestQuery,
} from "@payky/core/modules/payment/payment-queries"
import { derivePaymentStatus } from "@payky/core/modules/payment/payment-status-utils"
import { PaymentId } from "@payky/core/modules/payment/payment-types"
import { Currency, Integer } from "@payky/core/modules/shared/schema"
import { router, useLocalSearchParams } from "expo-router"
import { useAtomValue } from "jotai"
import { useEffect, useMemo, useRef, useState } from "react"
import { ActivityIndicator } from "react-native"
import { Text, XStack, YStack } from "tamagui"
import { accountAtom } from "../../atoms/account.ts"
import { AppButton } from "../../components/app-button.tsx"
import { CopyableQrCode } from "../../components/copyable-qr-code.tsx"
import { Field } from "../../components/field.tsx"
import { Screen } from "../../components/screen.tsx"
import { EmptyView } from "../../components/state-views.tsx"
import { nativeEnv } from "../../core/native-env.ts"
import { nativeConsole } from "../../core/native-runtime.ts"
import { useRequirePermission } from "../../core/use-access.ts"
import { useAppRun, useCashuAppRun } from "../../hooks/use-app-run.ts"
import { useEvoluQuery } from "../../hooks/use-evolu-query.ts"
import { useCashuRunToast, useRunToast } from "../../hooks/use-run-toast.ts"
import { useLocale, useTranslation } from "../../hooks/use-translation.ts"
import { readCashReceived } from "./cash-received.ts"
import { CashuPaymentTab } from "./payment-wait-cashu-tab.tsx"
import { IbanPaymentTab } from "./payment-wait-iban-tab.tsx"

// Spark/Lightning, cash, bank transfer and Cashu are offered here. Only
// methods native supports get a tab. A Bolt Card tap under the
// Lightning QR is H04, not here.

type MethodId = "spark" | "cash" | "iban" | "cashu"

const methodLabelKeys = {
  spark: "paymentWait.method.lightning",
  cash: "paymentWait.method.cash",
  iban: "paymentWait.method.iban",
  cashu: "paymentWait.method.cashu",
} satisfies Record<MethodId, TranslationKey>

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
  const cashuAppRun = useCashuAppRun()
  const runToast = useRunToast()
  const cashuRunToast = useCashuRunToast()
  const { require } = useRequirePermission()
  const deviceId = useAtomValue(accountAtom).device.id
  const [payment] = useEvoluQuery(paymentRequestQuery(paymentId)).data
  const claims = useEvoluQuery(paymentClaimsQuery(paymentId)).data
  const accounts = useEvoluQuery(enabledPaymentMethodAccountsQuery).data
  const [settings] = useEvoluQuery(settingsQuery).data
  const masterKey = useAtomValue(accountAtom).masterKey
  const [edited, setEdited] = useState<string | null>(null)
  const [errorKey, setErrorKey] = useState<TranslationKey | null>(null)
  const [ibanErrorKey, setIbanErrorKey] = useState<TranslationKey | null>(null)
  const [markPending, setMarkPending] = useState(false)
  const [ibanPending, setIbanPending] = useState(false)
  const [cancelPending, setCancelPending] = useState(false)
  const [newQuotePending, setNewQuotePending] = useState(false)
  const [selected, setSelected] = useState<MethodId | null>(null)
  const [selectedQrFormat, setSelectedQrFormat] = useState<BankQrFormat | null>(
    null
  )
  // The profile name is the recipient the bank QR names (payment/0005). It
  // comes from relays, so the QR shows at once and takes the name when it
  // lands rather than waiting on a relay that may be slow or down.
  const [profileName, setProfileName] = useState<string | null>(null)
  // Refs close the window before the pending state re-renders, so repeated
  // taps neither stack PIN prompts nor settle or cancel twice.
  const busyRef = useRef(false)
  const [preparation, setPreparation] = useState<PaymentMethodPreparationState>(
    {}
  )
  const [runner] = useState(createPaymentMethodPreparationRunner)

  useEffect(() => {
    let ignore = false
    void (async () => {
      try {
        await using run = appRun()
        const result = await run(
          fetchNostrProfile({ pubkey: getNostrIdentity(masterKey).pubkey })
        )
        if (!ignore && result.ok) setProfileName(result.value.name ?? null)
      } catch (error) {
        nativeConsole.error("Failed to read the profile name", error)
      }
    })()
    return () => {
      ignore = true
    }
  }, [appRun, masterKey])

  // The enabled accounts in the payment's currency, like web's tab list, in
  // the merchant's method order.
  const sparkAccount = accounts.find(
    (account) => account.kind === "spark" && account.sparkSecret !== null
  )
  const cashAccount = accounts.find(
    (account) =>
      account.kind === "cashRegister" &&
      account.cashRegisterCurrency === payment?.currency
  )
  const ibanAccount = accounts.find(
    (account) =>
      account.kind === "iban" &&
      account.iban !== null &&
      account.ibanCurrency === payment?.currency
  )
  // A Cashu account is not tied to a currency: the quote is for the sats.
  const cashuAccount = accounts.find((account) => account.kind === "cashu")
  const methods = useMemo(() => {
    const order = getPaymentMethodOrder(settings)
    const found: { id: MethodId; accountId: AccountId }[] = []
    if (sparkAccount !== undefined)
      found.push({ id: "spark", accountId: sparkAccount.id })
    if (cashAccount !== undefined)
      found.push({ id: "cash", accountId: cashAccount.id })
    if (ibanAccount !== undefined)
      found.push({ id: "iban", accountId: ibanAccount.id })
    if (cashuAccount !== undefined)
      found.push({ id: "cashu", accountId: cashuAccount.id })
    const kindOf = {
      spark: "spark",
      cash: "cashRegister",
      iban: "iban",
      cashu: "cashu",
    } as const
    return found.toSorted(
      (a, b) => order.indexOf(kindOf[a.id]) - order.indexOf(kindOf[b.id])
    )
  }, [settings, sparkAccount, cashAccount, ibanAccount, cashuAccount])
  const active = methods.find(({ id }) => id === selected) ?? methods[0]
  const preparationKey =
    active === undefined
      ? null
      : `${paymentId}:${active.id}:${active.accountId}`
  const sparkInvoice = payment?.lnInvoice ?? payment?.sparkInvoice ?? null
  const prepared =
    active?.id === "spark"
      ? sparkInvoice !== null
      : active?.id === "cash"
        ? payment?.cashRegisterAccountId !== null &&
          payment?.cashRegisterAccountId !== undefined
        : active?.id === "iban"
          ? payment?.ibanAccountId !== null &&
            payment?.ibanAccountId !== undefined
          : payment?.cashuLnInvoice !== null &&
            payment?.cashuLnInvoice !== undefined
  const preparationStatus =
    preparationKey === null ? undefined : preparation[preparationKey]
  // Spark invoices carry an `expiresAt` and nothing writes a row when it
  // passes, so the clock ticks to flip the derived status.
  const now = useNow([
    payment?.expiresAt ?? null,
    payment?.cashuQuoteExpiresAt ?? null,
  ])
  const status =
    payment === undefined
      ? null
      : derivePaymentStatus({
          canceledAt: payment.canceledAt,
          confirmedPaidAt: payment.confirmedPaidAt,
          expiresAt: payment.expiresAt,
          hasActiveClaim: claims.length > 0,
          now,
        })

  const ibanNumber = ibanAccount?.iban ?? null
  const ibanName = ibanAccount?.name ?? null
  const bankQrPayloads: ReadonlyArray<BankQrPayload> =
    payment !== undefined &&
    payment.ibanAccountId !== null &&
    ibanNumber !== null &&
    ibanName !== null
      ? createBankQrPayloads({
          profileName,
          bankAccountName: ibanName,
          iban: ibanNumber,
          amount: payment.amount,
          currency: payment.currency,
          specificSymbol: payment.specificSymbol,
          variableSymbol: payment.variableSymbol,
        })
      : []
  const defaultQrFormat = ibanAccount?.ibanDefaultQrFormat ?? "spayd"
  const activeQrFormat = selectedQrFormat ?? defaultQrFormat
  const bankQrPayload =
    (
      bankQrPayloads.find(({ format }) => format === activeQrFormat) ??
      bankQrPayloads.find(({ format }) => format === defaultQrFormat) ??
      bankQrPayloads[0]
    )?.payload ?? null

  // Attaches the method's account to the payment once; the runner dedups an
  // in-flight attempt, the state a finished or failed one.
  const prepare = (
    method: { id: MethodId; accountId: AccountId },
    key: string
  ) =>
    runner.run(key, async () => {
      try {
        // Only a Cashu preparation reads the Cashu wallet, and only now: no
        // other method waits on it, or fails with it.
        const attach = async () => {
          if (method.id === "cashu") {
            await using run = await cashuAppRun()
            return await run(
              prepareCashuPaymentMethod({
                paymentId,
                accountId: method.accountId,
              })
            )
          }
          await using run = appRun()
          return await run(
            preparePaymentMethod({
              paymentId,
              ...(method.id === "cash"
                ? { cashRegister: { accountId: method.accountId } }
                : method.id === "spark"
                  ? { spark: { accountId: method.accountId } }
                  : { bank: { accountId: method.accountId } }),
            })
          )
        }
        const result = await attach()
        if (!result.ok) {
          nativeConsole.error("Failed to prepare payment method", result.error)
          setPreparation((state) =>
            failPaymentMethodPreparation(state, key, result.error)
          )
        }
      } catch (error) {
        nativeConsole.error("Failed to prepare payment method", error)
        setPreparation((state) =>
          failPaymentMethodPreparation(state, key, error)
        )
      }
    })

  // `prepare` closes over stable inputs; the preparation state guards re-entry.
  // biome-ignore lint/correctness/useExhaustiveDependencies: see above
  useEffect(() => {
    if (status !== "pending" || active === undefined || preparationKey === null)
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
    void prepare(active, preparationKey)
  }, [status, active, preparationKey, prepared, preparation])

  if (payment === undefined || status === null)
    return <EmptyView message={t("paymentWait.notFound")} />
  if (status === "canceled") return <Closed messageKey="paymentWait.canceled" />
  if (status === "paid") return <Paid />

  const cashRegisterAccountId = payment.cashRegisterAccountId
  const { text, leastReceived, receivedAmount } = readCashReceived({
    amount: payment.amount,
    currency: payment.currency,
    edited,
  })
  const formatMinor = (value: number) =>
    formatMoney({ value: Integer(value), currency: payment.currency }, locale)
  const canMarkCashPaid =
    cashRegisterAccountId !== null && cashRegisterAccountId !== undefined
  const cashuQuoteExpiresAt = payment.cashuQuoteExpiresAt ?? null
  const cashuQrPayload =
    payment.cashuLnInvoice === null ||
    payment.cashuLnInvoice === undefined ||
    payment.cashuMintUrl === null ||
    payment.cashuMintUrl === undefined
      ? null
      : buildCashuPaymentUri({
          paymentId,
          lnInvoice: payment.cashuLnInvoice,
          amountSats: payment.cashuAmountSats ?? 0,
          mintUrl: payment.cashuMintUrl,
          nostrPubkey: getNostrIdentity(masterKey).pubkey,
          relays: nativeEnv.EXPO_PUBLIC_PAYKY_NOSTR_RELAYS,
        })
  const ibanAccountId = payment.ibanAccountId
  const canMarkIbanPaid = ibanAccountId !== null && ibanAccountId !== undefined
  const preparing =
    active !== undefined && !prepared && preparationStatus?.status !== "failed"

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

  const markIbanPaid = async () => {
    if (busyRef.current) return
    if (ibanAccountId === null || ibanAccountId === undefined) return
    busyRef.current = true
    try {
      if (!(await require("confirm", "access.action.markIbanPaid"))) return
      setIbanErrorKey(null)
      setIbanPending(true)
      await runToast(async (run) => {
        const result = await run(
          markPaymentPaidIban({ paymentId, accountId: ibanAccountId, deviceId })
        )
        if (!result.ok) {
          nativeConsole.error("Failed to mark bank transfer paid", result.error)
          setIbanErrorKey("paymentWait.ibanPaid.error")
        }
      })
    } finally {
      setIbanPending(false)
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
        // Only a bill payment has a cart to go back to; a keypad payment
        // sent to `/bill` without an id would open a brand-new empty bill.
        if (payment.billId === null) goHome()
        else
          router.dismissTo({
            pathname: "/bill",
            params: { billId: payment.billId },
          })
      })
    } finally {
      setCancelPending(false)
      busyRef.current = false
    }
  }

  // A new quote for an expired one: the old topup stays pending in the
  // wallet until the mint confirms it unpaid, and still settles if paid.
  const requestNewQuote = async () => {
    if (cashuAccount === undefined || busyRef.current) return
    busyRef.current = true
    setNewQuotePending(true)
    try {
      await cashuRunToast(async (run) => {
        const result = await run(
          prepareCashuPaymentMethod({
            paymentId,
            accountId: cashuAccount.id,
          })
        )
        if (!result.ok) {
          nativeConsole.error(
            "Failed to prepare a new Cashu quote",
            result.error
          )
          return "paymentWait.prepareError"
        }
      })
    } finally {
      setNewQuotePending(false)
      busyRef.current = false
    }
  }

  const retryPreparation = () => {
    if (active === undefined || preparationKey === null || prepared) return
    const transition = retryPaymentMethodPreparation(
      preparation,
      preparationKey
    )
    if (!transition.shouldPrepare) return
    setPreparation(transition.state)
    void prepare(active, preparationKey)
  }

  return (
    <Screen>
      <YStack items="center" gap="2" pt="6">
        <Text color="muted-foreground">{t("paymentWait.pay")}</Text>
        <Text fontSize={36} fontWeight="600" accessibilityRole="header">
          {formatMinor(payment.amount)}
        </Text>
        {active?.id === "spark" && payment.amountSats !== null ? (
          <Text color="muted-foreground">
            {formatMoney(
              { value: payment.amountSats, currency: Currency.BTC },
              locale
            )}
          </Text>
        ) : active?.id === "cashu" &&
          payment.cashuAmountSats !== null &&
          payment.cashuAmountSats !== undefined ? (
          <Text color="muted-foreground">
            {formatMoney(
              { value: payment.cashuAmountSats, currency: Currency.BTC },
              locale
            )}
          </Text>
        ) : null}
      </YStack>

      {methods.length > 1 ? (
        <XStack gap="2" justify="center">
          {methods.map(({ id }) => (
            <AppButton
              key={id}
              label={t(methodLabelKeys[id])}
              variant={id === active?.id ? "primary" : "secondary"}
              onPress={() => setSelected(id)}
            />
          ))}
        </XStack>
      ) : null}

      {active === undefined ? (
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
      ) : active.id === "spark" ? (
        <YStack gap="3" items="center">
          {sparkInvoice !== null ? (
            <CopyableQrCode value={sparkInvoice} />
          ) : (
            <YStack items="center" gap="2">
              <ActivityIndicator />
              <Text color="muted-foreground">
                {t("paymentWait.preparing.spark")}
              </Text>
            </YStack>
          )}
          {status === "expired" ? (
            <Text color="muted-foreground">{t("payment.status.expired")}</Text>
          ) : null}
        </YStack>
      ) : active.id === "cashu" ? (
        <YStack gap="3" items="center">
          <CashuPaymentTab
            paymentId={paymentId}
            qrPayload={cashuQrPayload}
            quoteExpired={
              cashuQuoteExpiresAt !== null &&
              now.getTime() >= cashuQuoteExpiresAt
            }
            newQuotePending={newQuotePending}
            onNewQuote={() => void requestNewQuote()}
          />
        </YStack>
      ) : active.id === "iban" && ibanNumber !== null ? (
        <IbanPaymentTab
          qrPayload={bankQrPayload}
          qrPayloads={bankQrPayloads}
          activeFormat={activeQrFormat}
          onSelectFormat={setSelectedQrFormat}
          iban={ibanNumber}
          variableSymbol={payment.variableSymbol}
          preparing={preparing}
          canMarkPaid={canMarkIbanPaid}
          pending={ibanPending}
          errorKey={ibanErrorKey}
          onMarkPaid={() => void markIbanPaid()}
        />
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
        disabled={markPending || ibanPending}
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
