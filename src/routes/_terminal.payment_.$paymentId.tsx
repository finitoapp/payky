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

import { FadeHeader } from "@/components/fade-header.tsx"
import { Button } from "@/components/ui/button.tsx"
import { Card, CardContent } from "@/components/ui/card.tsx"
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
import { createSparkWalletDep } from "@/core/spark/spark-wallet.ts"
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

export const Route = createFileRoute("/_terminal/payment_/$paymentId")({
  component: PaymentWaitingPage,
  staticData: {
    terminalLayout: {
      mainClassName: "bg-[#071012] text-white",
      viewportClassName: "bg-[#071012] px-7 py-7 text-white",
    },
  },
})

const paymentRequestQuery = (paymentId: PaymentId) =>
  createQuery((db) =>
    db
      .selectFrom("payment")
      .leftJoin("paymentSpark", (join) =>
        join
          .onRef("paymentSpark.id", "=", "payment.id")
          .on("paymentSpark.isDeleted", "is not", sqliteTrue)
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
        "paymentSpark.amountSats",
        "paymentSpark.lnInvoice",
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
  const { t } = useTranslation()
  const locale = useLocale()
  const evolu = useEvolu()
  const [cashPaymentPending, setCashPaymentPending] = useState(false)
  const [cashPaymentErrorKey, setCashPaymentErrorKey] =
    useState<TranslationKey | null>(null)
  const [preparePaymentErrorKey, setPreparePaymentErrorKey] =
    useState<TranslationKey | null>(null)
  const [preparingPaymentMethod, setPreparingPaymentMethod] =
    useState<PaymentMethodTab | null>(null)
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
      qrPayload: payment?.lnInvoice ?? null,
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
      preparingPaymentMethod !== null ||
      isPaid
    ) {
      return
    }

    const isPrepared =
      (activePaymentMethod.id === "spark" && payment.lnInvoice !== null) ||
      (activePaymentMethod.id === "iban" && payment.czQrPayload !== null) ||
      (activePaymentMethod.id === "cash" &&
        payment.cashRegisterAccountId !== null &&
        payment.cashRegisterAccountId !== undefined)
    if (isPrepared) return

    const prepareKey = `${paymentId}:${activePaymentMethod.id}:${activePaymentMethod.accountId}`
    if (preparePaymentMethodKeysRef.current.has(prepareKey)) return
    preparePaymentMethodKeysRef.current.add(prepareKey)

    const prepare = async () => {
      setPreparePaymentErrorKey(null)
      setPreparingPaymentMethod(activePaymentMethod.id)
      try {
        await using run = createRun({
          evolu,
          evoluOwnerId: evolu.appOwner.id,
          ...createFetchDep(),
          ...createSparkWalletDep(),
        })

        const result = await run(
          preparePaymentMethod({
            paymentId,
            method: activePaymentMethod.kind,
            accountId: activePaymentMethod.accountId,
          })
        )

        if (!result.ok) {
          console.error("Failed to prepare payment method", result.error)
          setPreparePaymentErrorKey("paymentWait.prepareError")
        }
      } finally {
        setPreparingPaymentMethod(null)
      }
    }

    void prepare()
  }, [
    activePaymentMethod,
    evolu,
    isPaid,
    payment,
    paymentId,
    preparingPaymentMethod,
  ])

  if (!payment) {
    return (
      <PaymentWaitingMessage>{t("paymentWait.notFound")}</PaymentWaitingMessage>
    )
  }

  const qrPayload = activePaymentMethod?.qrPayload ?? null
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
      <div className="h-0" />
      <FadeHeader />

      <div className="flex min-h-full flex-col justify-between gap-8">
        <section className="flex flex-1 flex-col items-center justify-center gap-7 text-center">
          <div className="flex flex-col items-center gap-2">
            <p className="text-sm font-medium text-white/60">
              {t("paymentWait.pay")}
            </p>
            <h1 className="text-4xl font-semibold tracking-tight text-white tabular-nums">
              {formatMoney(
                {
                  value: payment.amount,
                  currency: payment.currency,
                },
                locale
              )}
            </h1>
            <p className="text-md font-medium text-white/55 tabular-nums">
              {payment.amountSats === null
                ? "\u00A0"
                : `₿${payment.amountSats.toLocaleString(locale)}`}
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
                <TabsList className="mx-auto h-16 rounded-full border border-white/15 bg-background p-2 text-white/60">
                  {paymentMethods.map((method) => (
                    <TabsTrigger
                      key={method.id}
                      value={method.id}
                      className="h-full rounded-full px-6 text-white/60 data-active:bg-white data-active:text-black dark:data-active:bg-white dark:data-active:text-black [&_svg:not([class*='size-'])]:size-7"
                    >
                      {method.icon}
                      <span>{method.label}</span>
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            ) : (
              <p className="max-w-72 text-balance text-sm text-white/55">
                {t("paymentWait.missingRequest")}
              </p>
            )}
          </div>

          {preparePaymentErrorKey ? (
            <p className="max-w-72 text-balance text-sm font-medium text-destructive">
              {t(preparePaymentErrorKey)}
            </p>
          ) : null}

          {preparingPaymentMethod ? (
            <div className="flex items-center gap-2 text-sm text-white/55">
              <LoaderCircleIcon className="animate-spin" />
              <span>{t("paymentWait.preparingRequest")}</span>
            </div>
          ) : null}

          {qrPayload && (
            <div className="w-full px-6">
              <Card className={"bg-white w-full aspect-square"}>
                <CardContent className={"flex flex-col"}>
                  <QRCodeSVG value={qrPayload} className="size-full" />
                </CardContent>
              </Card>
            </div>
          )}

          {isCashPaymentMethod && (
            <div className="flex w-full flex-col items-center py-24">
              <Button
                type="button"
                size="lg"
                disabled={!canMarkCashPaid || cashPaymentPending}
                onClick={() => void handleMarkCashPaid()}
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
              {cashRegisterAccountId === null ||
              cashRegisterAccountId === undefined ? (
                <p className="max-w-72 text-balance text-sm text-white/55">
                  {t("paymentWait.cashPaid.unavailable")}
                </p>
              ) : null}
            </div>
          )}

          <div className="flex flex-col items-center gap-4">
            <div className="flex items-center gap-5 text-white">
              <p className="text-lg font-semibold tracking-tight">
                {isCashPaymentMethod
                  ? t("paymentWait.cashPaid.prompt")
                  : t("paymentWait.scanOrTap")}
              </p>
            </div>
            <p className="flex items-center gap-2 text-sm text-white/55">
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

function PaymentWaitingMessage({ children }: { readonly children: string }) {
  return (
    <div className="flex min-h-full items-center justify-center px-8 text-center text-lg text-white/70">
      {children}
    </div>
  )
}
