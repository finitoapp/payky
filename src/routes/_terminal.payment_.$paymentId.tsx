import { type KyselyNotNull, sqliteTrue } from "@evolu/common"
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import {
  BanknoteIcon,
  CheckIcon,
  CopyIcon,
  EyeIcon,
  EyeOffIcon,
  LandmarkIcon,
  LoaderCircleIcon,
  ZapIcon,
} from "lucide-react"
import {
  type ReactNode,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react"
import { toast } from "sonner"
import { CopyableQrCode } from "@/components/copyable-qr-code.tsx"
import { FadeHeader } from "@/components/fade-header.tsx"
import { SuccessPanel } from "@/components/success-panel.tsx"
import { Button } from "@/components/ui/button.tsx"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs.tsx"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group.tsx"
import { createQuery } from "@/core/evolu/schema.ts"
import type { AccountId } from "@/core/modules/account/account-types.ts"
import { settingsQuery } from "@/core/modules/app-settings/app-settings-queries.ts"
import type { DefaultPaymentMethod } from "@/core/modules/app-settings/app-settings-types.ts"
import {
  getDefaultPaymentMethod,
  parsePaymentMethodOrder,
} from "@/core/modules/app-settings/app-settings-utils.ts"
import {
  cancelPayment,
  markPaymentPaidCash,
  markPaymentPaidIban,
  preparePaymentMethod,
} from "@/core/modules/payment/payment-actions.ts"
import {
  type BankQrPayload,
  createBankQrPayloads,
  isBankQrFormat,
} from "@/core/modules/payment/payment-iban-qr-payload-utils.ts"
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
import { formatAddressGroups } from "@/features/withdraw/withdraw-utils.ts"
import { useAppRun } from "@/hooks/use-app-run.ts"
import { useConsole } from "@/hooks/use-console.ts"
import { useEvoluQuery } from "@/hooks/use-evolu-query.ts"
import { useLocale } from "@/hooks/use-locale.ts"
import { useNow } from "@/hooks/use-now.ts"
import { useScreenWakeLock } from "@/hooks/use-screen-wake-lock.ts"
import { useTranslation } from "@/hooks/use-translation.ts"
import type { TranslationKey } from "@/i18n/resources.ts"
import { copyToClipboard } from "@/lib/clipboard.ts"
import { formatMoney } from "@/lib/format-utils.ts"
import { cn } from "@/lib/utils.ts"

type PaymentMethodTab = "spark" | "iban" | "cash"

interface PaymentMethodOptionBase {
  readonly kind: DefaultPaymentMethod
  readonly accountId: AccountId
  readonly label: string
  readonly icon: ReactNode
}

type PaymentMethodOption = PaymentMethodOptionBase &
  (
    | { readonly id: "spark"; readonly qrPayload: string | null }
    | {
        readonly id: "iban"
        readonly qrPayload: string | null
        readonly qrPayloads: ReadonlyArray<BankQrPayload>
        readonly defaultQrFormat: BankQrFormat
        readonly iban: string | null
      }
    | { readonly id: "cash"; readonly qrPayload: null }
  )

interface CashPaymentTabProps {
  readonly canMarkCashPaid: boolean
  readonly cashPaymentErrorKey: TranslationKey | null
  readonly cashPaymentPending: boolean
  readonly cashRegisterAccountId: AccountId | null | undefined
  readonly onMarkCashPaid: () => void
}

interface IbanPaidTabProps {
  readonly canMarkIbanPaid: boolean
  readonly ibanPaymentErrorKey: TranslationKey | null
  readonly ibanPaymentPending: boolean
  readonly ibanVariableSymbol: string | null
  readonly onMarkIbanPaid: () => void
}

const preparingPaymentMethodKeys = {
  spark: "paymentWait.preparing.spark",
  iban: "paymentWait.preparing.iban",
  cash: "paymentWait.preparing.cash",
} satisfies Record<PaymentMethodTab, TranslationKey>

const paymentWaitQrFormatShortLabelKeys = {
  payBySquare1_0_0: "paymentWait.qrFormatShort.payBySquare1_0_0",
  payBySquare1_2_0: "paymentWait.qrFormatShort.payBySquare1_2_0",
  spayd: "paymentWait.qrFormatShort.spayd",
} satisfies Record<BankQrFormat, TranslationKey>

export const Route = createFileRoute("/_terminal/payment_/$paymentId")({
  component: PaymentWaitingPage,
  staticData: {
    terminalLayout: {
      viewportClassName: "px-7",
    },
  },
})

const paymentRequestQuery = (paymentId: PaymentId) =>
  createQuery((db) =>
    db
      .selectFrom("payment")
      .leftJoin("paymentBtc", (join) =>
        join
          .onRef("paymentBtc.id", "=", "payment.id")
          .on("paymentBtc.isDeleted", "is not", sqliteTrue)
      )
      .leftJoin("paymentBtcLightning", (join) =>
        join
          .onRef("paymentBtcLightning.id", "=", "payment.id")
          .on("paymentBtcLightning.isDeleted", "is not", sqliteTrue)
      )
      .leftJoin("paymentBtcSpark", (join) =>
        join
          .onRef("paymentBtcSpark.id", "=", "payment.id")
          .on("paymentBtcSpark.isDeleted", "is not", sqliteTrue)
      )
      .leftJoin("paymentIban", (join) =>
        join
          .onRef("paymentIban.id", "=", "payment.id")
          .on("paymentIban.isDeleted", "is not", sqliteTrue)
      )
      .leftJoin("paymentCashRegister", (join) =>
        join
          .onRef("paymentCashRegister.id", "=", "payment.id")
          .on("paymentCashRegister.isDeleted", "is not", sqliteTrue)
      )
      .select([
        "payment.id",
        "payment.billId",
        "payment.amount",
        "payment.currency",
        "payment.tipAmount",
        "payment.canceledAt",
        "payment.confirmedPaidAt",
        "payment.expiresAt",
        "paymentBtc.amountSats",
        "paymentBtcLightning.lnInvoice",
        "paymentBtcSpark.sparkInvoice",
        "paymentIban.accountId as ibanAccountId",
        "paymentIban.variableSymbol",
        "paymentIban.specificSymbol",
        "paymentCashRegister.accountId as cashRegisterAccountId",
      ])
      .where("payment.id", "=", paymentId)
      .where("payment.isDeleted", "is not", sqliteTrue)
      .where("payment.amount", "is not", null)
      .where("payment.currency", "is not", null)
      .where("payment.tipAmount", "is not", null)
      .$narrowType<{
        amount: KyselyNotNull
        currency: KyselyNotNull
        tipAmount: KyselyNotNull
      }>()
  )

/**
 * Whether this payment has money against it, as one row or none. Joined
 * through `accountTransaction` rather than counting claims outright: a claim
 * whose transaction was deleted is not money that arrived, and the bill's
 * coverage already ignores it — see `paymentsWithClaimsByBillIdQuery` and
 * `claimedPaymentIdSet` for the same reading elsewhere.
 */
const paymentClaimsQuery = (paymentId: PaymentId) =>
  createQuery((db) =>
    db
      .selectFrom("reconciliationClaim")
      .innerJoin(
        "accountTransaction",
        "accountTransaction.id",
        "reconciliationClaim.accountTransactionId"
      )
      .select(["reconciliationClaim.id", "reconciliationClaim.claimedAt"])
      .where("reconciliationClaim.paymentId", "=", paymentId)
      .where("reconciliationClaim.isDeleted", "is not", sqliteTrue)
      .where("accountTransaction.isDeleted", "is not", sqliteTrue)
      .limit(1)
  )

const enabledPaymentMethodAccountsQuery = createQuery((db) =>
  db
    .selectFrom("account")
    .leftJoin("accountSpark", (join) =>
      join
        .onRef("accountSpark.id", "=", "account.id")
        .on("accountSpark.isDeleted", "is not", sqliteTrue)
    )
    .leftJoin("accountIban", (join) =>
      join
        .onRef("accountIban.id", "=", "account.id")
        .on("accountIban.isDeleted", "is not", sqliteTrue)
    )
    .leftJoin("accountCashRegister", (join) =>
      join
        .onRef("accountCashRegister.id", "=", "account.id")
        .on("accountCashRegister.isDeleted", "is not", sqliteTrue)
    )
    .select([
      "account.id",
      "account.kind",
      "accountSpark.secret as sparkSecret",
      "account.name",
      "accountIban.iban",
      "accountIban.currency as ibanCurrency",
      "accountIban.defaultQrFormat as ibanDefaultQrFormat",
      "accountCashRegister.currency as cashRegisterCurrency",
    ])
    .where("account.isDeleted", "is not", sqliteTrue)
    .where("account.id", "is not", null)
    .where("account.kind", "is not", null)
    .$narrowType<{
      id: KyselyNotNull
      kind: KyselyNotNull
    }>()
)

function PaymentWaitingPage() {
  const { paymentId } = Route.useParams()

  return (
    <Suspense fallback={null}>
      <PaymentWaitingContent paymentId={paymentId} />
    </Suspense>
  )
}

function PaymentWaitingContent({ paymentId }: { readonly paymentId: string }) {
  const { t } = useTranslation()
  const parsedPaymentId = PaymentId.safeParse(paymentId)

  if (!parsedPaymentId.success) {
    return (
      <PaymentWaitingMessage>
        {t("paymentWait.invalidId")}
      </PaymentWaitingMessage>
    )
  }

  return <PaymentWaitingRequest paymentId={parsedPaymentId.data} />
}

function PaymentWaitingRequest({
  paymentId,
}: {
  readonly paymentId: PaymentId
}) {
  const appRun = useAppRun()
  const console = useConsole()
  const { t } = useTranslation()
  const locale = useLocale()
  const navigate = useNavigate()
  const [cashPaymentPending, setCashPaymentPending] = useState(false)
  const [cashPaymentErrorKey, setCashPaymentErrorKey] =
    useState<TranslationKey | null>(null)
  const [ibanPaymentPending, setIbanPaymentPending] = useState(false)
  const [ibanPaymentErrorKey, setIbanPaymentErrorKey] =
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
  const configuredDefaultPaymentMethod = getDefaultPaymentMethod(
    settings?.defaultPaymentMethod
  )

  const orderedPaymentMethods = useMemo(() => {
    const paymentMethods: PaymentMethodOption[] = []
    const paymentMethodOrder = parsePaymentMethodOrder(
      settings?.paymentMethodOrderJson
    )

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

    return paymentMethods.toSorted(
      (firstMethod, secondMethod) =>
        paymentMethodOrder.indexOf(firstMethod.kind) -
        paymentMethodOrder.indexOf(secondMethod.kind)
    )
  }, [
    enabledPaymentMethodAccounts,
    payment,
    selectedIbanQrFormat,
    settings?.paymentMethodOrderJson,
    t,
  ])
  const selectedPaymentMethodOption =
    selectedPaymentMethod === null
      ? null
      : (orderedPaymentMethods.find(
          (method) => method.id === selectedPaymentMethod
        ) ?? null)
  const defaultPaymentMethodOption =
    orderedPaymentMethods.find(
      (method) => method.kind === configuredDefaultPaymentMethod
    ) ?? null
  const activePaymentMethod =
    selectedPaymentMethodOption ??
    defaultPaymentMethodOption ??
    orderedPaymentMethods[0] ??
    null
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
        payment.cashRegisterAccountId !== undefined))

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
    return (
      <PaymentWaitingMessage>{t("paymentWait.notFound")}</PaymentWaitingMessage>
    )
  }

  if (payment.canceledAt !== null) {
    return (
      <PaymentWaitingMessage>{t("paymentWait.canceled")}</PaymentWaitingMessage>
    )
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
                    value === "cash"
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
                <TabsList className="mx-auto h-16 rounded-full border border-black/15 dark:border-white/15  bg-background p-2 px-3 text-muted-foreground">
                  {orderedPaymentMethods.map((method) => (
                    <TabsTrigger
                      key={method.id}
                      value={method.id}
                      className="h-full rounded-full px-5 -mx-1 text-muted-foreground data-active:bg-foreground data-active:text-background dark:data-active:bg-white dark:data-active:text-black"
                    >
                      {method.icon}
                      <span>{method.label}</span>
                    </TabsTrigger>
                  ))}
                </TabsList>
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

          {activePreparingPaymentMethodKey && isCashPaymentMethod ? (
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
              canMarkIbanPaid={canMarkIbanPaid}
              ibanPaymentErrorKey={ibanPaymentErrorKey}
              ibanPaymentPending={ibanPaymentPending}
              ibanVariableSymbol={payment.variableSymbol}
              preparingMessageKey={activePreparingPaymentMethodKey}
              selectedIbanQrFormat={selectedIbanQrFormat}
              onSelectIbanQrFormat={setSelectedIbanQrFormat}
              onMarkCashPaid={() => void handleMarkCashPaid()}
              onMarkIbanPaid={() => void handleMarkIbanPaid()}
            />
          ) : null}

          <div className="flex flex-col items-center gap-4">
            <div className="flex items-center gap-5 text-foreground">
              <p className="text-lg font-semibold tracking-tight">
                {isCashPaymentMethod
                  ? t("paymentWait.cashPaid.prompt")
                  : t("paymentWait.scanOrTap")}
              </p>
            </div>
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <LoaderCircleIcon className="animate-spin" />
              <span>{t("paymentWait.waiting")}</span>
            </p>
            {wakeLockEnabled && !wakeLockSupported ? (
              <p className="max-w-80 text-balance text-xs text-muted-foreground">
                {t("paymentWait.wakeLockUnsupported")}
              </p>
            ) : null}
            {canCancelPayment ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={cancelPending}
                onClick={() => void handleCancelPayment()}
              >
                {cancelPending ? (
                  <LoaderCircleIcon className="animate-spin" />
                ) : null}
                {t("paymentWait.cancel")}
              </Button>
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

function PaymentMethodTabContent({
  method,
  canMarkCashPaid,
  cashPaymentErrorKey,
  cashPaymentPending,
  cashRegisterAccountId,
  canMarkIbanPaid,
  ibanPaymentErrorKey,
  ibanPaymentPending,
  ibanVariableSymbol,
  preparingMessageKey,
  selectedIbanQrFormat,
  onSelectIbanQrFormat,
  onMarkCashPaid,
  onMarkIbanPaid,
}: {
  readonly method: PaymentMethodOption
  readonly preparingMessageKey: TranslationKey | null
  readonly selectedIbanQrFormat: BankQrFormat | null
  readonly onSelectIbanQrFormat: (format: BankQrFormat) => void
} & CashPaymentTabProps &
  IbanPaidTabProps) {
  switch (method.id) {
    case "spark":
      return (
        <QrPaymentRequest
          qrPayload={method.qrPayload}
          preparingMessageKey={preparingMessageKey}
        />
      )
    case "iban":
      return (
        <IbanPaymentTab
          defaultQrFormat={method.defaultQrFormat}
          qrPayload={method.qrPayload}
          qrPayloads={method.qrPayloads}
          iban={method.iban}
          preparingMessageKey={preparingMessageKey}
          selectedQrFormat={selectedIbanQrFormat}
          onSelectQrFormat={onSelectIbanQrFormat}
          canMarkIbanPaid={canMarkIbanPaid}
          ibanPaymentErrorKey={ibanPaymentErrorKey}
          ibanPaymentPending={ibanPaymentPending}
          ibanVariableSymbol={ibanVariableSymbol}
          onMarkIbanPaid={onMarkIbanPaid}
        />
      )
    case "cash":
      return (
        <CashPaymentTab
          canMarkCashPaid={canMarkCashPaid}
          cashPaymentErrorKey={cashPaymentErrorKey}
          cashPaymentPending={cashPaymentPending}
          cashRegisterAccountId={cashRegisterAccountId}
          onMarkCashPaid={onMarkCashPaid}
        />
      )
  }
}

function IbanPaymentTab({
  defaultQrFormat,
  qrPayload,
  qrPayloads,
  iban,
  preparingMessageKey,
  selectedQrFormat,
  onSelectQrFormat,
  canMarkIbanPaid,
  ibanPaymentErrorKey,
  ibanPaymentPending,
  ibanVariableSymbol,
  onMarkIbanPaid,
}: {
  readonly defaultQrFormat: BankQrFormat
  readonly qrPayload: string | null
  readonly qrPayloads: ReadonlyArray<BankQrPayload>
  readonly iban: string | null
  readonly preparingMessageKey: TranslationKey | null
  readonly selectedQrFormat: BankQrFormat | null
  readonly onSelectQrFormat: (format: BankQrFormat) => void
} & IbanPaidTabProps) {
  const { t } = useTranslation()
  const activeQrFormat = selectedQrFormat ?? defaultQrFormat
  const [detailsVisible, setDetailsVisible] = useState(false)
  const hasDetails = iban !== null || ibanVariableSymbol !== null

  return (
    <div className="flex w-full flex-col items-center gap-3">
      <QrPaymentRequest
        qrPayload={qrPayload}
        preparingMessageKey={preparingMessageKey}
      />
      {qrPayloads.length > 1 ? (
        <ToggleGroup<BankQrFormat>
          value={[activeQrFormat]}
          onValueChange={(value) => {
            const [nextFormat] = value
            if (isBankQrFormat(nextFormat)) {
              onSelectQrFormat(nextFormat)
            }
          }}
          variant="default"
          className="h-11 rounded-full border border-black/15 bg-background p-1 px-1.5 text-muted-foreground dark:border-white/15"
        >
          {qrPayloads.map((payload) => (
            <ToggleGroupItem
              key={payload.format}
              value={payload.format}
              aria-label={t(`paymentWait.qrFormat.${payload.format}`)}
              className="h-full min-w-12 -mx-0.5 rounded-full px-3 text-xs font-medium text-muted-foreground hover:bg-transparent hover:text-foreground data-[state=on]:bg-foreground data-[state=on]:text-background aria-pressed:bg-foreground aria-pressed:text-background dark:data-[state=on]:bg-white dark:data-[state=on]:text-black dark:aria-pressed:bg-white dark:aria-pressed:text-black"
            >
              {t(paymentWaitQrFormatShortLabelKeys[payload.format])}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      ) : null}
      {detailsVisible && hasDetails ? (
        <div className="flex w-full max-w-xs flex-col gap-2">
          {iban !== null ? (
            <CopyableDetailRow
              label={t("paymentWait.ibanDetails.iban.label")}
              value={iban}
              displayValue={formatAddressGroups(iban)}
              copyAriaLabel={t("paymentWait.ibanDetails.iban.copy")}
              copiedMessage={t("paymentWait.ibanDetails.iban.copied")}
              copyFailedMessage={t("paymentWait.ibanDetails.iban.copyError")}
            />
          ) : null}
          {ibanVariableSymbol !== null ? (
            <CopyableDetailRow
              label={t("paymentWait.ibanDetails.variableSymbol.label")}
              value={ibanVariableSymbol}
              copyAriaLabel={t("paymentWait.ibanDetails.variableSymbol.copy")}
              copiedMessage={t("paymentWait.ibanDetails.variableSymbol.copied")}
              copyFailedMessage={t(
                "paymentWait.ibanDetails.variableSymbol.copyError"
              )}
            />
          ) : null}
        </div>
      ) : null}
      <div className="flex items-center gap-2">
        {hasDetails ? (
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label={
              detailsVisible
                ? t("paymentWait.ibanDetails.hide")
                : t("paymentWait.ibanDetails.show")
            }
            aria-pressed={detailsVisible}
            onClick={() => {
              setDetailsVisible((current) => !current)
            }}
          >
            {detailsVisible ? <EyeOffIcon /> : <EyeIcon />}
          </Button>
        ) : null}
        <Button
          type="button"
          variant="outline"
          size="lg"
          disabled={!canMarkIbanPaid || ibanPaymentPending}
          onClick={onMarkIbanPaid}
        >
          {ibanPaymentPending ? (
            <LoaderCircleIcon className="animate-spin" />
          ) : (
            <CheckIcon />
          )}
          {ibanPaymentPending
            ? t("paymentWait.ibanPaid.pending")
            : t("paymentWait.ibanPaid.action")}
        </Button>
      </div>
      {ibanPaymentErrorKey ? (
        <p className="text-sm font-medium text-destructive">
          {t(ibanPaymentErrorKey)}
        </p>
      ) : null}
    </div>
  )
}

function CopyableDetailRow({
  label,
  value,
  displayValue,
  copyAriaLabel,
  copiedMessage,
  copyFailedMessage,
}: {
  readonly label: string
  readonly value: string
  readonly displayValue?: string
  readonly copyAriaLabel: string
  readonly copiedMessage: string
  readonly copyFailedMessage: string
}) {
  const copyValue = () => {
    void copyToClipboard(value, {
      copied: copiedMessage,
      failed: copyFailedMessage,
    })
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-black/15 px-3 py-2 dark:border-white/15">
      <span className="flex min-w-0 flex-col items-start text-left">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="truncate font-mono text-sm">
          {displayValue ?? value}
        </span>
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={copyAriaLabel}
        onClick={copyValue}
      >
        <CopyIcon />
      </Button>
    </div>
  )
}

function CashPaymentTab({
  canMarkCashPaid,
  cashPaymentErrorKey,
  cashPaymentPending,
  cashRegisterAccountId,
  onMarkCashPaid,
}: CashPaymentTabProps) {
  const { t } = useTranslation()

  return (
    <div className="flex w-full flex-col items-center py-24">
      <Button
        type="button"
        size="lg"
        disabled={!canMarkCashPaid || cashPaymentPending}
        onClick={onMarkCashPaid}
        className="h-14 px-8 text-base"
      >
        {cashPaymentPending ? (
          <LoaderCircleIcon className="animate-spin" />
        ) : (
          <CheckIcon />
        )}
        {cashPaymentPending
          ? t("paymentWait.cashPaid.pending")
          : t("paymentWait.cashPaid.action")}
      </Button>
      {cashPaymentErrorKey ? (
        <p className="text-sm font-medium text-destructive">
          {t(cashPaymentErrorKey)}
        </p>
      ) : null}
      {cashRegisterAccountId === null || cashRegisterAccountId === undefined ? (
        <p className="max-w-72 text-balance text-sm text-muted-foreground">
          {t("paymentWait.cashPaid.unavailable")}
        </p>
      ) : null}
    </div>
  )
}

function QrPaymentRequest({
  qrPayload,
  preparingMessageKey,
}: {
  readonly qrPayload: string | null
  readonly preparingMessageKey: TranslationKey | null
}) {
  const { t } = useTranslation()

  return (
    <CopyableQrCode
      {...(qrPayload !== null
        ? { state: "ready" as const, value: qrPayload }
        : preparingMessageKey !== null
          ? { state: "pending" as const, pendingLabel: t(preparingMessageKey) }
          : { state: "empty" as const })}
      ariaLabel={t("paymentWait.copyQr")}
      copiedMessage={t("paymentWait.qrCopied")}
      copyFailedMessage={t("paymentWait.qrCopyFailed")}
    />
  )
}

function PaymentWaitingMessage({ children }: { readonly children: string }) {
  return (
    <div className="flex min-h-full items-center justify-center px-8 text-center text-lg text-muted-foreground">
      {children}
    </div>
  )
}
