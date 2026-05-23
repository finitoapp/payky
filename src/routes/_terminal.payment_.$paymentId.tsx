import { type KyselyNotNull, sqliteTrue } from "@evolu/common"
import { createRun } from "@evolu/web"
import { createFileRoute, Link } from "@tanstack/react-router"
import {
  BanknoteIcon,
  CheckIcon,
  LandmarkIcon,
  LoaderCircleIcon,
  ZapIcon,
} from "lucide-react"
import { QRCodeSVG } from "qrcode.react"
import {
  type ReactNode,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { toast } from "sonner"

import { FadeHeader } from "@/components/fade-header.tsx"
import { Button } from "@/components/ui/button.tsx"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs.tsx"
import { createFetchDep } from "@/core/deps.ts"
import { createQuery } from "@/core/evolu/schema.ts"
import type { AccountId } from "@/core/modules/account/account-types.ts"
import {
  markPaymentPaidCash,
  preparePaymentMethod,
} from "@/core/modules/payment/payment-actions.ts"
import { PaymentId } from "@/core/modules/payment/payment-types.ts"
import { Currency } from "@/core/modules/shared/schema.ts"
import { createSparkWalletDep } from "@/core/spark/spark-wallet.ts"
import { useConsole } from "@/hooks/use-console.ts"
import { useEvolu } from "@/hooks/use-evolu.ts"
import { useEvoluQuery } from "@/hooks/use-evolu-query.ts"
import { useLocale } from "@/hooks/use-locale.ts"
import { useTranslation } from "@/hooks/use-translation.ts"
import type { TranslationKey } from "@/i18n/resources.ts"
import { formatMoney } from "@/lib/format-utils.ts"
import { cn } from "@/lib/utils.ts"

type PaymentMethodTab = "spark" | "iban" | "cash"
type PaymentMethodKind = "spark" | "iban" | "cashRegister"

interface PaymentMethodOption {
  readonly id: PaymentMethodTab
  readonly kind: PaymentMethodKind
  readonly accountId: AccountId
  readonly label: string
  readonly qrPayload: string | null
  readonly icon: ReactNode
}

interface CashPaymentTabProps {
  readonly canMarkCashPaid: boolean
  readonly cashPaymentErrorKey: TranslationKey | null
  readonly cashPaymentPending: boolean
  readonly cashRegisterAccountId: AccountId | null | undefined
  readonly onMarkCashPaid: () => void
}

const preparingPaymentMethodKeys = {
  spark: "paymentWait.preparing.spark",
  iban: "paymentWait.preparing.iban",
  cash: "paymentWait.preparing.cash",
} satisfies Record<PaymentMethodTab, TranslationKey>

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
        "payment.amount",
        "payment.currency",
        "payment.tipAmount",
        "payment.canceledAt",
        "paymentBtc.amountSats",
        "paymentBtcLightning.lnInvoice",
        "paymentBtcSpark.sparkInvoice",
        "paymentIban.czQrPayload",
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

const paymentClaimsQuery = (paymentId: PaymentId) =>
  createQuery((db) =>
    db
      .selectFrom("reconciliationClaim")
      .select(["id", "claimedAt"])
      .where("paymentId", "=", paymentId)
      .where("isDeleted", "is not", sqliteTrue)
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
      "accountSpark.mnemonic as sparkMnemonic",
      "accountIban.iban",
      "accountIban.currency as ibanCurrency",
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
  const console = useConsole()
  const { t } = useTranslation()
  const locale = useLocale()
  const evolu = useEvolu()
  const [cashPaymentPending, setCashPaymentPending] = useState(false)
  const [cashPaymentErrorKey, setCashPaymentErrorKey] =
    useState<TranslationKey | null>(null)
  const [preparePaymentErrorMethods, setPreparePaymentErrorMethods] = useState<
    ReadonlySet<PaymentMethodTab>
  >(() => new Set())
  const [preparingPaymentMethods, setPreparingPaymentMethods] = useState<
    ReadonlySet<PaymentMethodTab>
  >(() => new Set())
  const [successVisible, setSuccessVisible] = useState(false)
  const [selectedPaymentMethod, setSelectedPaymentMethod] =
    useState<PaymentMethodTab>("spark")
  const preparePaymentMethodKeysRef = useRef(new Set<string>())
  const query = useMemo(() => paymentRequestQuery(paymentId), [paymentId])
  const claimsQuery = useMemo(() => paymentClaimsQuery(paymentId), [paymentId])
  const { data: payments } = useEvoluQuery(query)
  const { data: claims } = useEvoluQuery(claimsQuery)
  const { data: enabledPaymentMethodAccounts } = useEvoluQuery(
    enabledPaymentMethodAccountsQuery
  )
  const payment = payments[0]
  const isPaid = claims.length > 0
  const paymentMethods: PaymentMethodOption[] = []

  const enabledSparkAccount = enabledPaymentMethodAccounts.find(
    (account) => account.kind === "spark" && account.sparkMnemonic !== null
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
    paymentMethods.push({
      id: "iban",
      kind: "iban",
      accountId: enabledIbanAccount.id,
      label: t("paymentWait.method.iban"),
      qrPayload: payment?.czQrPayload ?? null,
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

  const activePaymentMethod =
    paymentMethods.find((method) => method.id === selectedPaymentMethod) ??
    paymentMethods[0] ??
    null
  const activePreparingPaymentMethodKey =
    activePaymentMethod !== null &&
    preparingPaymentMethods.has(activePaymentMethod.id)
      ? preparingPaymentMethodKeys[activePaymentMethod.id]
      : null
  const activePreparePaymentErrorKey =
    activePaymentMethod !== null &&
    preparePaymentErrorMethods.has(activePaymentMethod.id)
      ? "paymentWait.prepareError"
      : null

  useEffect(() => {
    if (!isPaid || successVisible) return

    setSuccessVisible(true)
  }, [isPaid, successVisible])

  useEffect(() => {
    if (
      activePaymentMethod === null ||
      activePaymentMethod.id === selectedPaymentMethod
    ) {
      return
    }

    setSelectedPaymentMethod(activePaymentMethod.id)
  }, [activePaymentMethod, selectedPaymentMethod])

  useEffect(() => {
    if (
      payment === undefined ||
      activePaymentMethod === null ||
      preparingPaymentMethods.has(activePaymentMethod.id) ||
      isPaid
    ) {
      return
    }

    const isPrepared =
      (activePaymentMethod.id === "spark" &&
        (payment.lnInvoice !== null || payment.sparkInvoice !== null)) ||
      (activePaymentMethod.id === "iban" && payment.czQrPayload !== null) ||
      (activePaymentMethod.id === "cash" &&
        payment.cashRegisterAccountId !== null &&
        payment.cashRegisterAccountId !== undefined)
    if (isPrepared) return

    const prepareKey = `${paymentId}:${activePaymentMethod.id}:${activePaymentMethod.accountId}`
    if (preparePaymentMethodKeysRef.current.has(prepareKey)) return
    preparePaymentMethodKeysRef.current.add(prepareKey)

    const prepare = async () => {
      setPreparePaymentErrorMethods((methods) => {
        const nextMethods = new Set(methods)
        nextMethods.delete(activePaymentMethod.id)
        return nextMethods
      })
      setPreparingPaymentMethods((methods) =>
        new Set(methods).add(activePaymentMethod.id)
      )
      try {
        await using run = createRun({
          console,
          evolu,
          evoluOwnerId: evolu.appOwner.id,
          ...createFetchDep(),
          ...createSparkWalletDep(),
        })

        const result = await run(
          preparePaymentMethod({
            paymentId,
            ...(activePaymentMethod.kind === "cashRegister"
              ? {
                  cashRegister: {
                    accountId: activePaymentMethod.accountId,
                  },
                }
              : {}),
            ...(activePaymentMethod.kind === "iban"
              ? {
                  bank: {
                    accountId: activePaymentMethod.accountId,
                  },
                }
              : {}),
            ...(activePaymentMethod.kind === "spark"
              ? {
                  spark: {
                    accountId: activePaymentMethod.accountId,
                  },
                }
              : {}),
          })
        )

        if (!result.ok) {
          console.error("Failed to prepare payment method", result.error)
          setPreparePaymentErrorMethods((methods) =>
            new Set(methods).add(activePaymentMethod.id)
          )
        }
      } finally {
        setPreparingPaymentMethods((methods) => {
          const nextMethods = new Set(methods)
          nextMethods.delete(activePaymentMethod.id)
          return nextMethods
        })
      }
    }

    void prepare()
  }, [
    activePaymentMethod,
    evolu,
    isPaid,
    payment,
    paymentId,
    preparingPaymentMethods,
    console,
  ])

  if (!payment) {
    return (
      <PaymentWaitingMessage>{t("paymentWait.notFound")}</PaymentWaitingMessage>
    )
  }

  const cashRegisterAccountId = payment.cashRegisterAccountId
  const isCashPaymentMethod = activePaymentMethod?.id === "cash"
  const canMarkCashPaid =
    isCashPaymentMethod &&
    cashRegisterAccountId !== null &&
    cashRegisterAccountId !== undefined &&
    !isPaid

  const handleMarkCashPaid = async () => {
    if (!canMarkCashPaid) return

    setCashPaymentErrorKey(null)
    setCashPaymentPending(true)
    try {
      await using run = createRun({
        console,
        evolu,
        evoluOwnerId: evolu.appOwner.id,
      })

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
                {paymentMethods.map((method) => (
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
                  {paymentMethods.map((method) => (
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
            <p className="max-w-72 text-balance text-sm font-medium text-destructive">
              {t(activePreparePaymentErrorKey)}
            </p>
          ) : null}

          {activePreparingPaymentMethodKey ? (
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
              onMarkCashPaid={() => void handleMarkCashPaid()}
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
          </div>
        </section>

        <div
          className={cn(
            "absolute inset-0 flex items-center justify-center bg-background transition-opacity duration-300",
            successVisible ? "opacity-100" : "pointer-events-none opacity-0"
          )}
          aria-hidden={!successVisible}
        >
          <div className="flex flex-col items-center gap-5 text-center">
            <div className="flex size-24 items-center justify-center rounded-full bg-green-500 text-[#071012]">
              <CheckIcon className="size-14" strokeWidth={3} />
            </div>
            <p className="text-3xl font-semibold">{t("paymentWait.paid")}</p>
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
  onMarkCashPaid,
}: {
  readonly method: PaymentMethodOption
} & CashPaymentTabProps) {
  switch (method.id) {
    case "spark":
      return <SparkPaymentTab qrPayload={method.qrPayload} />
    case "iban":
      return <IbanPaymentTab qrPayload={method.qrPayload} />
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

function SparkPaymentTab({ qrPayload }: { readonly qrPayload: string | null }) {
  return <QrPaymentRequest qrPayload={qrPayload} />
}

function IbanPaymentTab({ qrPayload }: { readonly qrPayload: string | null }) {
  return <QrPaymentRequest qrPayload={qrPayload} />
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
}: {
  readonly qrPayload: string | null
}) {
  const { t } = useTranslation()

  if (qrPayload === null) return null

  const copyQrPayload = async () => {
    try {
      await navigator.clipboard.writeText(qrPayload)
      toast.success(t("paymentWait.qrCopied"))
    } catch {
      toast.error(t("paymentWait.qrCopyFailed"))
    }
  }

  return (
    <div className="w-full px-6">
      <button
        type="button"
        className="aspect-square w-full rounded-xl bg-white p-4 text-black ring-1 ring-foreground/10 transition-transform active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        onClick={() => void copyQrPayload()}
        aria-label={t("paymentWait.copyQr")}
      >
        <span className="flex size-full flex-col">
          <QRCodeSVG value={qrPayload} className="size-full" />
        </span>
      </button>
    </div>
  )
}

function PaymentWaitingMessage({ children }: { readonly children: string }) {
  return (
    <div className="flex min-h-full items-center justify-center px-8 text-center text-lg text-muted-foreground">
      {children}
    </div>
  )
}
