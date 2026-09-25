import { Capacitor } from "@capacitor/core"
import { Link, useNavigate } from "@tanstack/react-router"
import {
  BanknoteIcon,
  CreditCardIcon,
  LandmarkIcon,
  LoaderCircleIcon,
  XIcon,
  ZapIcon,
} from "lucide-react"
import { LayoutGroup, motion } from "motion/react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"

import { FadeHeader } from "@/components/fade-header.tsx"
import { RouteMessage } from "@/components/route-message.tsx"
import {
  SlidingPillSegmentContent,
  slidingPillLayout,
  useSlidingPillTransition,
} from "@/components/sliding-pill.tsx"
import { SuccessPanel } from "@/components/success-panel.tsx"
import { Button } from "@/components/ui/button.tsx"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs.tsx"
import { enabledPaymentMethodAccountsQuery } from "@/core/modules/account/account-queries.ts"
import { settingsQuery } from "@/core/modules/app-settings/app-settings-queries.ts"
import { getPaymentMethodOrder } from "@/core/modules/app-settings/app-settings-utils.ts"
import {
  cancelPayment,
  markPaymentPaidCash,
  markPaymentPaidIban,
  payPaymentWithSwitchioCard,
} from "@/core/modules/payment/payment-actions.ts"
import type { PayPaymentWithSwitchioCardError } from "@/core/modules/payment/payment-errors.ts"
import {
  type BankQrPayload,
  createBankQrPayloads,
} from "@/core/modules/payment/payment-iban-qr-payload-utils.ts"
import { preparePaymentMethod } from "@/core/modules/payment/payment-preparation-actions.ts"
import {
  paymentClaimsQuery,
  paymentRequestQuery,
} from "@/core/modules/payment/payment-queries.ts"
import { derivePaymentStatus } from "@/core/modules/payment/payment-status-utils.ts"
import { PaymentId } from "@/core/modules/payment/payment-types.ts"
import { type BankQrFormat, Currency } from "@/core/modules/shared/schema.ts"
import {
  clearPaymentMethodPreparation,
  createPaymentMethodPreparationRunner,
  failPaymentMethodPreparation,
  type PaymentMethodPreparationState,
  requestPaymentMethodPreparation,
  retryPaymentMethodPreparation,
} from "@/features/payment-wait/payment-method-preparation.ts"
import { PaymentMethodTabContent } from "@/features/payment-wait/payment-wait-method-tabs.tsx"
import type {
  PaymentMethodOption,
  PaymentMethodTab,
} from "@/features/payment-wait/payment-wait-types.ts"
import { useAppRun } from "@/hooks/use-app-run.ts"
import { useConfirmDialog } from "@/hooks/use-confirm-dialog.ts"
import { useConsole } from "@/hooks/use-console.ts"
import { useEvoluQuery } from "@/hooks/use-evolu-query.ts"
import { useLocale } from "@/hooks/use-locale.ts"
import { useNow } from "@/hooks/use-now.ts"
import { useScreenWakeLock } from "@/hooks/use-screen-wake-lock.ts"
import { useTranslation } from "@/hooks/use-translation.ts"
import type { TranslationKey } from "@/i18n/resources.ts"
import { formatMoney } from "@/lib/format-utils.ts"
import { cn } from "@/lib/utils.ts"

const preparingPaymentMethodKeys = {
  spark: "paymentWait.preparing.spark",
  iban: "paymentWait.preparing.iban",
  cash: "paymentWait.preparing.cash",
  card: "paymentWait.preparing.card",
} satisfies Record<PaymentMethodTab, TranslationKey>

/**
 * A card decline and an unreadable terminal result must never read the
 * same: after an unreadable result the card may well have been charged, so
 * staff has to check SwitchioPay instead of simply tapping again.
 */
const cardPaymentErrorKeys = {
  PaymentNotFound: "paymentWait.cardPaid.error.generic",
  PaymentNotPayable: "paymentWait.cardPaid.error.notPayable",
  CardSwitchioAccountNotFound: "paymentWait.cardPaid.error.generic",
  AccountCurrencyMismatch: "paymentWait.cardPaid.error.generic",
  SwitchioAttemptUnresolved: "paymentWait.cardPaid.error.unreadable",
  SwitchioUnavailable: "paymentWait.cardPaid.error.unavailable",
  SwitchioPaymentFailed: "paymentWait.cardPaid.error.declined",
  SwitchioResultUnreadable: "paymentWait.cardPaid.error.unreadable",
} satisfies Record<PayPaymentWithSwitchioCardError["type"], TranslationKey>

export function PaymentWaitPage({ paymentId }: { readonly paymentId: string }) {
  const { t } = useTranslation()
  const parsedPaymentId = PaymentId.safeParse(paymentId)

  if (!parsedPaymentId.success) {
    return <RouteMessage>{t("paymentWait.invalidId")}</RouteMessage>
  }

  return <PaymentWaitRequest paymentId={parsedPaymentId.data} />
}

function PaymentWaitRequest({ paymentId }: { readonly paymentId: PaymentId }) {
  const appRun = useAppRun()
  const console = useConsole()
  const { t } = useTranslation()
  const locale = useLocale()
  const navigate = useNavigate()
  const confirm = useConfirmDialog()
  const pillTransition = useSlidingPillTransition()
  const [cashPaymentPending, setCashPaymentPending] = useState(false)
  const [cashPaymentErrorKey, setCashPaymentErrorKey] =
    useState<TranslationKey | null>(null)
  const [ibanPaymentPending, setIbanPaymentPending] = useState(false)
  const [ibanPaymentErrorKey, setIbanPaymentErrorKey] =
    useState<TranslationKey | null>(null)
  const [cardPaymentPending, setCardPaymentPending] = useState(false)
  const [cardPaymentErrorKey, setCardPaymentErrorKey] =
    useState<TranslationKey | null>(null)
  const [cancelPending, setCancelPending] = useState(false)
  const [paymentMethodPreparationState, setPaymentMethodPreparationState] =
    useState<PaymentMethodPreparationState>({})
  const [paymentMethodPreparationRunner] = useState(
    createPaymentMethodPreparationRunner
  )
  const [successVisible, setSuccessVisible] = useState(false)
  const [selectedPaymentMethod, setSelectedPaymentMethod] =
    useState<PaymentMethodTab | null>(null)
  const [selectedIbanQrFormat, setSelectedIbanQrFormat] =
    useState<BankQrFormat | null>(null)
  const query = paymentRequestQuery(paymentId)
  const claimsQuery = paymentClaimsQuery(paymentId)
  const { data: payments } = useEvoluQuery(query)
  const { data: claims } = useEvoluQuery(claimsQuery)
  const { data: settingsData } = useEvoluQuery(settingsQuery)
  const { data: enabledPaymentMethodAccounts } = useEvoluQuery(
    enabledPaymentMethodAccountsQuery
  )
  const payment = payments[0]
  const [settings] = settingsData
  // Spark/Lightning payments always carry an `expiresAt`, and nothing writes
  // a row when that moment arrives — so without a ticking clock the expired
  // QR stayed on screen, `wakeLockEnabled` stayed true and Cancel kept
  // treating the payment as live until some unrelated query update forced a
  // re-render.
  const now = useNow([payment?.expiresAt ?? null])
  const paymentStatus =
    payment === undefined
      ? null
      : derivePaymentStatus({
          canceledAt: payment.canceledAt,
          confirmedPaidAt: payment.confirmedPaidAt,
          expiresAt: payment.expiresAt,
          hasActiveClaim: claims.length > 0,
          now,
        })
  // `derivePaymentStatus` ranks `canceled` above `paid` (see
  // docs/bill-payment-states.md), so `isPaid` here can never be true for a
  // payment that also has `canceledAt` set — unlike the old `claims.length >
  // 0` check, which ignored cancellation entirely.
  const isPaid = paymentStatus === "paid"
  const wakeLockEnabled = payment !== undefined && paymentStatus === "pending"
  const { supported: wakeLockSupported } = useScreenWakeLock(wakeLockEnabled)

  const orderedPaymentMethods = useMemo(() => {
    const paymentMethods: PaymentMethodOption[] = []
    const paymentMethodOrder = getPaymentMethodOrder(settings)

    const enabledSparkAccount = enabledPaymentMethodAccounts.find(
      (account) => account.kind === "spark" && account.sparkSecret !== null
    )
    if (enabledSparkAccount) {
      paymentMethods.push({
        id: "spark",
        kind: "spark",
        accountId: enabledSparkAccount.id,
        label: t("paymentWait.method.lightning"),
        qrPayload: payment?.lnInvoice ?? payment?.sparkInvoice ?? null,
        icon: <ZapIcon />,
      })
    }

    const enabledIbanAccount = enabledPaymentMethodAccounts.find(
      (account) =>
        account.kind === "iban" &&
        account.iban !== null &&
        account.ibanCurrency === payment?.currency
    )
    if (enabledIbanAccount) {
      const defaultQrFormat = enabledIbanAccount.ibanDefaultQrFormat ?? "spayd"
      const activeQrFormat = selectedIbanQrFormat ?? defaultQrFormat
      const canCreateIbanQrPayloads =
        payment !== undefined &&
        payment.ibanAccountId !== null &&
        enabledIbanAccount.iban !== null &&
        enabledIbanAccount.name !== null
      const availableIbanQrPayloads: ReadonlyArray<BankQrPayload> =
        canCreateIbanQrPayloads
          ? createBankQrPayloads({
              beneficiaryName: enabledIbanAccount.name,
              iban: enabledIbanAccount.iban,
              amount: payment.amount,
              currency: payment.currency,
              specificSymbol: payment.specificSymbol,
              variableSymbol: payment.variableSymbol,
            })
          : []
      const activeQrPayload =
        availableIbanQrPayloads.find(
          (payload) => payload.format === activeQrFormat
        )?.payload ??
        availableIbanQrPayloads.find(
          (payload) => payload.format === defaultQrFormat
        )?.payload ??
        availableIbanQrPayloads[0]?.payload ??
        null

      paymentMethods.push({
        id: "iban",
        kind: "iban",
        accountId: enabledIbanAccount.id,
        label: t("paymentWait.method.iban"),
        qrPayload: activeQrPayload,
        qrPayloads: availableIbanQrPayloads,
        defaultQrFormat,
        iban: enabledIbanAccount.iban,
        icon: <LandmarkIcon />,
      })
    }

    const enabledCashRegisterAccount = enabledPaymentMethodAccounts.find(
      (account) =>
        account.kind === "cashRegister" &&
        account.cashRegisterCurrency === payment?.currency
    )
    if (enabledCashRegisterAccount) {
      paymentMethods.push({
        id: "cash",
        kind: "cashRegister",
        accountId: enabledCashRegisterAccount.id,
        label: t("paymentWait.method.cash"),
        qrPayload: null,
        icon: <BanknoteIcon />,
      })
    }

    // The SwitchioPay terminal is driven through Android intents, so the
    // method only exists inside the native app — offering it in a browser or
    // PWA would render a tab whose only button can never work.
    const enabledCardAccount = Capacitor.isNativePlatform()
      ? enabledPaymentMethodAccounts.find(
          (account) =>
            account.kind === "cardSwitchio" &&
            account.cardCurrency === payment?.currency
        )
      : undefined
    if (enabledCardAccount) {
      paymentMethods.push({
        id: "card",
        kind: "cardSwitchio",
        accountId: enabledCardAccount.id,
        label: t("paymentWait.method.card"),
        qrPayload: null,
        icon: <CreditCardIcon />,
      })
    }

    return paymentMethods.toSorted(
      (firstMethod, secondMethod) =>
        paymentMethodOrder.indexOf(firstMethod.kind) -
        paymentMethodOrder.indexOf(secondMethod.kind)
    )
  }, [enabledPaymentMethodAccounts, payment, selectedIbanQrFormat, settings, t])
  const selectedPaymentMethodOption =
    selectedPaymentMethod === null
      ? null
      : (orderedPaymentMethods.find(
          (method) => method.id === selectedPaymentMethod
        ) ?? null)
  const activePaymentMethod =
    selectedPaymentMethodOption ?? orderedPaymentMethods[0] ?? null
  const activePreparationKey =
    activePaymentMethod === null
      ? null
      : `${paymentId}:${activePaymentMethod.id}:${activePaymentMethod.accountId}`
  const activePreparationStatus =
    activePreparationKey === null
      ? undefined
      : paymentMethodPreparationState[activePreparationKey]
  const activePreparingPaymentMethodKey =
    activePaymentMethod !== null &&
    activePreparationStatus?.status === "preparing"
      ? preparingPaymentMethodKeys[activePaymentMethod.id]
      : null
  const activePreparePaymentErrorKey =
    activePreparationStatus?.status === "failed"
      ? "paymentWait.prepareError"
      : null
  const activePaymentMethodIsPrepared =
    activePaymentMethod !== null &&
    payment !== undefined &&
    ((activePaymentMethod.id === "spark" &&
      (payment.lnInvoice !== null || payment.sparkInvoice !== null)) ||
      (activePaymentMethod.id === "iban" && payment.ibanAccountId !== null) ||
      (activePaymentMethod.id === "cash" &&
        payment.cashRegisterAccountId !== null &&
        payment.cashRegisterAccountId !== undefined) ||
      (activePaymentMethod.id === "card" &&
        payment.cardAccountId !== null &&
        payment.cardAccountId !== undefined))

  const runPaymentMethodPreparation = useCallback(
    async (
      method: Pick<PaymentMethodOption, "accountId" | "kind">,
      preparationKey: string
    ) => {
      try {
        await using run = appRun()

        const result = await run(
          preparePaymentMethod({
            paymentId,
            ...(method.kind === "cashRegister"
              ? { cashRegister: { accountId: method.accountId } }
              : {}),
            ...(method.kind === "cardSwitchio"
              ? { card: { accountId: method.accountId } }
              : {}),
            ...(method.kind === "iban"
              ? { bank: { accountId: method.accountId } }
              : {}),
            ...(method.kind === "spark"
              ? {
                  spark: { accountId: method.accountId },
                }
              : {}),
          })
        )

        if (!result.ok) {
          console.error("Failed to prepare payment method", result.error)
          setPaymentMethodPreparationState((state) =>
            failPaymentMethodPreparation(state, preparationKey, result.error)
          )
        }
      } catch (error) {
        console.error("Failed to prepare payment method", error)
        setPaymentMethodPreparationState((state) =>
          failPaymentMethodPreparation(state, preparationKey, error)
        )
      }
    },
    [appRun, console, paymentId]
  )

  useEffect(() => {
    if (isPaid) setSuccessVisible(true)
  }, [isPaid])

  useEffect(() => {
    if (
      selectedPaymentMethod === null ||
      orderedPaymentMethods.some(
        (method) => method.id === selectedPaymentMethod
      )
    ) {
      return
    }

    setSelectedPaymentMethod(null)
  }, [orderedPaymentMethods, selectedPaymentMethod])

  useEffect(() => {
    if (
      payment === undefined ||
      activePaymentMethod === null ||
      activePreparationKey === null ||
      isPaid
    ) {
      return
    }

    if (activePaymentMethodIsPrepared) {
      setPaymentMethodPreparationState((state) =>
        clearPaymentMethodPreparation(state, activePreparationKey)
      )
      return
    }

    const transition = requestPaymentMethodPreparation(
      paymentMethodPreparationState,
      activePreparationKey
    )
    if (!transition.shouldPrepare) return

    setPaymentMethodPreparationState(transition.state)
    void paymentMethodPreparationRunner.run(activePreparationKey, () =>
      runPaymentMethodPreparation(activePaymentMethod, activePreparationKey)
    )
  }, [
    activePaymentMethodIsPrepared,
    activePreparationKey,
    activePaymentMethod,
    isPaid,
    payment,
    paymentMethodPreparationRunner,
    paymentMethodPreparationState,
    runPaymentMethodPreparation,
  ])

  const handleRetryPaymentMethodPreparation = () => {
    if (
      activePaymentMethod === null ||
      activePreparationKey === null ||
      activePaymentMethodIsPrepared ||
      isPaid
    ) {
      return
    }

    const transition = retryPaymentMethodPreparation(
      paymentMethodPreparationState,
      activePreparationKey
    )
    if (!transition.shouldPrepare) return

    setPaymentMethodPreparationState(transition.state)
    void paymentMethodPreparationRunner.run(activePreparationKey, () =>
      runPaymentMethodPreparation(activePaymentMethod, activePreparationKey)
    )
  }

  if (!payment) {
    return <RouteMessage>{t("paymentWait.notFound")}</RouteMessage>
  }

  if (payment.canceledAt !== null) {
    return <RouteMessage>{t("paymentWait.canceled")}</RouteMessage>
  }

  const cashRegisterAccountId = payment.cashRegisterAccountId
  const isCashPaymentMethod = activePaymentMethod?.id === "cash"
  const canMarkCashPaid =
    isCashPaymentMethod &&
    cashRegisterAccountId !== null &&
    cashRegisterAccountId !== undefined &&
    !isPaid
  const ibanAccountId = payment.ibanAccountId
  const isIbanPaymentMethod = activePaymentMethod?.id === "iban"
  const canMarkIbanPaid =
    isIbanPaymentMethod &&
    ibanAccountId !== null &&
    ibanAccountId !== undefined &&
    !isPaid
  const cardAccountId = payment.cardAccountId
  const isCardPaymentMethod = activePaymentMethod?.id === "card"
  const cardUnresolvedTransactionId = payment.cardUnresolvedTransactionId
  const canPayCard =
    isCardPaymentMethod &&
    cardAccountId !== null &&
    cardAccountId !== undefined &&
    paymentStatus === "pending"
  const canCancelPayment = payment.canceledAt === null && !isPaid

  const handleMarkCashPaid = async () => {
    if (!canMarkCashPaid) return

    setCashPaymentErrorKey(null)
    setCashPaymentPending(true)
    try {
      await using run = appRun()

      const result = await run(
        markPaymentPaidCash({
          paymentId,
          accountId: cashRegisterAccountId,
        })
      )

      if (!result.ok) {
        console.error("Failed to mark cash payment paid", result.error)
        setCashPaymentErrorKey("paymentWait.cashPaid.error")
      }
    } finally {
      setCashPaymentPending(false)
    }
  }

  const handleMarkIbanPaid = async () => {
    if (!canMarkIbanPaid) return

    setIbanPaymentErrorKey(null)
    setIbanPaymentPending(true)
    try {
      await using run = appRun()

      const result = await run(
        markPaymentPaidIban({
          paymentId,
          accountId: ibanAccountId,
        })
      )

      if (!result.ok) {
        console.error("Failed to mark bank transfer paid", result.error)
        setIbanPaymentErrorKey("paymentWait.ibanPaid.error")
      }
    } finally {
      setIbanPaymentPending(false)
    }
  }

  const handlePayCard = async () => {
    if (!canPayCard) return

    // The last attempt's outcome is unknown, so the card may already have
    // been charged: another attempt only after staff has checked SwitchioPay.
    const retryUnresolved =
      cardUnresolvedTransactionId !== null &&
      cardUnresolvedTransactionId !== undefined
    if (retryUnresolved) {
      const confirmed = await confirm({
        title: t("paymentWait.cardPaid.retryUnresolved.title"),
        description: t("paymentWait.cardPaid.retryUnresolved.description", {
          transactionId: cardUnresolvedTransactionId,
        }),
        confirmLabel: t("paymentWait.cardPaid.retryUnresolved.confirm"),
        cancelLabel: t("paymentWait.cardPaid.retryUnresolved.cancel"),
        variant: "destructive",
      })
      if (!confirmed) return
    }

    setCardPaymentErrorKey(null)
    setCardPaymentPending(true)
    try {
      await using run = appRun()

      const result = await run(
        payPaymentWithSwitchioCard({
          paymentId,
          accountId: cardAccountId,
          retryUnresolved,
        })
      )

      if (!result.ok) {
        console.error("Failed to take the card payment", result.error)
        setCardPaymentErrorKey(cardPaymentErrorKeys[result.error.type])
      }
    } finally {
      setCardPaymentPending(false)
    }
  }

  const handleCancelPayment = async () => {
    if (!canCancelPayment) return

    setCancelPending(true)
    try {
      await using run = appRun()
      const result = await run(cancelPayment(paymentId))

      if (!result.ok) {
        console.error("Failed to cancel payment", result.error)
        toast.error(t("paymentWait.cancelError"))
        return
      }

      // Only a bill payment has a cart to go back to. Sending a keypad
      // payment to `/bill` without a `billId` made the route's `beforeLoad`
      // mint a fresh `createRandomBillId()` and redirect, so cancelling a
      // plain amount payment dropped the user into a brand-new empty bill
      // editor instead of the keypad.
      await (payment.billId === null
        ? navigate({ to: "/" })
        : navigate({ to: "/bill", search: { billId: payment.billId } }))
    } finally {
      setCancelPending(false)
    }
  }

  return (
    <>
      <FadeHeader />

      <div className="flex min-h-full flex-col justify-between gap-8">
        <section className="flex flex-1 flex-col items-center justify-start gap-7 pt-10 text-center">
          <div className="flex flex-col items-center gap-2">
            <p className="text-sm font-medium text-muted-foreground">
              {t("paymentWait.pay")}
            </p>
            <h1 className="text-4xl font-semibold tracking-tight tabular-nums text-foreground">
              {formatMoney(
                {
                  value: payment.amount,
                  currency: payment.currency,
                },
                locale
              )}
            </h1>
            <p className="text-md font-medium text-muted-foreground tabular-nums">
              {payment.amountSats === null
                ? "\u00A0"
                : `${formatMoney(
                    {
                      value: payment.amountSats,
                      currency: Currency.BTC,
                    },
                    locale
                  )}`}
            </p>
          </div>

          <div className="flex justify-center">
            {activePaymentMethod ? (
              <Tabs
                value={activePaymentMethod.id}
                onValueChange={(value) => {
                  if (
                    value === "spark" ||
                    value === "iban" ||
                    value === "cash" ||
                    value === "card"
                  ) {
                    setSelectedPaymentMethod(value)
                  }
                }}
                className="w-fit items-center gap-4"
              >
                {orderedPaymentMethods.map((method) => (
                  <TabsContent
                    key={method.id}
                    value={method.id}
                    className="sr-only"
                  >
                    {method.qrPayload === null
                      ? t("paymentWait.missingRequest")
                      : t("paymentWait.scanOrTap")}
                  </TabsContent>
                ))}
                {/* Same control as the home mode switch: `sliding-pill.tsx`. */}
                <LayoutGroup>
                  <TabsList
                    render={
                      <motion.div {...slidingPillLayout(pillTransition)} />
                    }
                    className="mx-auto h-16 gap-0.5 border border-black/15 bg-background p-2 text-muted-foreground dark:border-white/15"
                  >
                    {orderedPaymentMethods.map((method) => {
                      const active = method.id === activePaymentMethod.id
                      return (
                        <TabsTrigger
                          key={method.id}
                          value={method.id}
                          aria-label={method.label}
                          render={
                            <motion.button
                              {...slidingPillLayout(pillTransition)}
                            />
                          }
                          className="isolate h-full min-w-12 flex-none gap-0 border-0 text-muted-foreground transition-colors duration-300 data-active:bg-transparent data-active:text-background data-active:shadow-none dark:data-active:bg-transparent dark:data-active:text-background motion-reduce:transition-none px-6"
                        >
                          <SlidingPillSegmentContent
                            active={active}
                            pillId="payment-method-pill"
                            icon={method.icon}
                            label={method.label}
                          />
                        </TabsTrigger>
                      )
                    })}
                  </TabsList>
                </LayoutGroup>
              </Tabs>
            ) : (
              <p className="max-w-72 text-balance text-sm text-muted-foreground">
                {t("paymentWait.missingRequest")}
              </p>
            )}
          </div>

          {activePreparePaymentErrorKey ? (
            <div className="flex flex-col items-center gap-3">
              <p className="max-w-72 text-balance text-sm font-medium text-destructive">
                {t(activePreparePaymentErrorKey)}
              </p>
              <Button
                type="button"
                variant="outline"
                disabled={activePreparationStatus?.status === "preparing"}
                aria-label={t("paymentWait.prepareRetry")}
                onClick={handleRetryPaymentMethodPreparation}
              >
                {t("paymentWait.prepareRetry")}
              </Button>
            </div>
          ) : null}

          {activePreparingPaymentMethodKey &&
          (isCashPaymentMethod || isCardPaymentMethod) ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <LoaderCircleIcon className="animate-spin" />
              <span>{t(activePreparingPaymentMethodKey)}</span>
            </div>
          ) : null}

          {activePaymentMethod ? (
            <PaymentMethodTabContent
              method={activePaymentMethod}
              canMarkCashPaid={canMarkCashPaid}
              cashPaymentErrorKey={cashPaymentErrorKey}
              cashPaymentPending={cashPaymentPending}
              cashRegisterAccountId={cashRegisterAccountId}
              canPayCard={canPayCard}
              cardPaymentErrorKey={cardPaymentErrorKey}
              cardPaymentPending={cardPaymentPending}
              cardAccountId={cardAccountId}
              cardUnresolvedTransactionId={
                cardPaymentPending ? null : cardUnresolvedTransactionId
              }
              canMarkIbanPaid={canMarkIbanPaid}
              ibanPaymentErrorKey={ibanPaymentErrorKey}
              ibanPaymentPending={ibanPaymentPending}
              ibanVariableSymbol={payment.variableSymbol}
              preparingMessageKey={activePreparingPaymentMethodKey}
              selectedIbanQrFormat={selectedIbanQrFormat}
              onSelectIbanQrFormat={setSelectedIbanQrFormat}
              onMarkCashPaid={() => void handleMarkCashPaid()}
              onMarkIbanPaid={() => void handleMarkIbanPaid()}
              onPayCard={() => void handlePayCard()}
            />
          ) : null}

          <div className="flex flex-col items-center gap-4">
            <div className="flex items-center gap-5 text-foreground">
              <p className="text-lg font-semibold tracking-tight">
                {isCashPaymentMethod
                  ? t("paymentWait.cashPaid.prompt")
                  : isCardPaymentMethod
                    ? t("paymentWait.cardPaid.prompt")
                    : t("paymentWait.scanOrTap")}
              </p>
            </div>
            {wakeLockEnabled && !wakeLockSupported ? (
              <p className="max-w-80 text-balance text-xs text-muted-foreground">
                {t("paymentWait.wakeLockUnsupported")}
              </p>
            ) : null}
            {canCancelPayment ? (
              <div className={"pt-2"}>
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  disabled={cancelPending}
                  onClick={() => void handleCancelPayment()}
                >
                  {cancelPending ? (
                    <LoaderCircleIcon className="animate-spin" />
                  ) : (
                    <XIcon />
                  )}
                  {t("paymentWait.cancel")}
                </Button>
              </div>
            ) : null}
          </div>
        </section>

        <div
          className={cn(
            "absolute inset-0 flex items-center justify-center bg-background transition-opacity duration-300",
            successVisible ? "opacity-100" : "pointer-events-none opacity-0"
          )}
          aria-hidden={!successVisible}
          data-testid="payment-paid-panel"
        >
          <div className="flex flex-col items-center gap-4">
            <SuccessPanel
              title={t("paymentWait.paid")}
              actions={
                <div className="flex flex-col items-center gap-8 pt-16 w-full">
                  <Button
                    size="lg"
                    nativeButton={false}
                    render={<Link to="/" />}
                    className={"h-16 w-80"}
                  >
                    {t("paymentWait.back")}
                  </Button>
                  <Button
                    variant="outline"
                    size="lg"
                    className={"h-12 w-80"}
                    nativeButton={false}
                    render={
                      <Link
                        to="/activity/$paymentId"
                        params={{ paymentId }}
                        aria-label={t("paymentWait.detail")}
                      />
                    }
                  >
                    {t("paymentWait.detail")}
                  </Button>
                </div>
              }
            />
          </div>
        </div>
      </div>
    </>
  )
}
