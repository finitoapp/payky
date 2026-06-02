import { sqliteTrue } from "@evolu/common"
import { createRun } from "@evolu/web"
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { useStore } from "jotai"
import { Clock3, Grid2X2, Settings } from "lucide-react"
import { Suspense } from "react"
import { accountAtom } from "@/atoms/account.ts"
import { TerminalPaymentKeypadWithSettings } from "@/components/terminal-payment-keypad.tsx"
import { Button } from "@/components/ui/button.tsx"
import { createFetchDep } from "@/core/deps.ts"
import { createQuery } from "@/core/evolu/schema.ts"
import { activeSparkAccountsQuery } from "@/core/modules/account/account-spark-queries.ts"
import { createPreparedPayment } from "@/core/modules/payment/payment-actions.ts"
import type { Money } from "@/core/modules/shared/money.ts"
import {
  FiatCurrencySchema,
  NonNegativeInteger,
} from "@/core/modules/shared/schema.ts"
import { createSparkWalletDep } from "@/core/spark/spark-wallet.ts"
import { useEvolu } from "@/hooks/use-evolu.ts"
import { useTranslation } from "@/i18n/use-translation.ts"

export const Route = createFileRoute("/_terminal/")({
  component: TerminalHomePage,
  staticData: {
    terminalLayout: {
      mainClassName: "bg-[#00C245]",
      viewportClassName: "justify-between px-8 py-6",
    },
  },
})

const Header = () => {
  const { t } = useTranslation()

  return (
    <header className="flex items-center justify-between">
      <Button
        variant={"ghost"}
        render={<Link aria-label={t("nav.checkout")} to="/checkout" />}
      >
        <Grid2X2 className={"size-6"} strokeWidth={3} />
      </Button>
      <div className="flex items-center gap-4">
        <Button
          variant={"ghost"}
          render={<Link aria-label={t("nav.activity")} to="/activity" />}
        >
          <Clock3 className={"size-6"} strokeWidth={3} />
        </Button>
        <Button
          variant={"ghost"}
          render={<Link aria-label={t("nav.settings")} to="/settings" />}
        >
          <Settings className={"size-6"} strokeWidth={3} />
        </Button>
      </div>
    </header>
  )
}

const activeCashRegisterAccountsQuery = createQuery((db) =>
  db
    .selectFrom("account")
    .innerJoin("accountCashRegister", "accountCashRegister.id", "account.id")
    .select(["account.id", "accountCashRegister.currency"])
    .where("account.kind", "=", "cashRegister")
    .where("account.isDeleted", "is not", sqliteTrue)
    .where("accountCashRegister.isDeleted", "is not", sqliteTrue)
    .where("accountCashRegister.currency", "is not", null)
)

function TerminalPaymentKeypadLoader() {
  const evolu = useEvolu()
  const navigate = useNavigate()
  const jotaiStore = useStore()

  const handleCharge = async (money: Money) => {
    const [sparkAccount] = await evolu.loadQuery(activeSparkAccountsQuery)
    const [cashRegisterAccount] = await evolu.loadQuery(
      activeCashRegisterAccountsQuery
    )
    const { device } = await jotaiStore.get(accountAtom)

    await using run = createRun({
      evolu,
      evoluOwnerId: evolu.appOwner.id,
      ...createFetchDep(),
      ...createSparkWalletDep(),
    })

    const amount = NonNegativeInteger(money.value)
    const currency = FiatCurrencySchema.parse(money.currency)

    const result = await run(
      createPreparedPayment({
        deviceId: device.id,
        billId: null,
        tableId: null,
        amount,
        currency,
        tipAmount: NonNegativeInteger(0),
        canceledAt: null,
        cashRegister:
          cashRegisterAccount?.currency === currency
            ? {
                accountId: cashRegisterAccount.id,
              }
            : undefined,
        spark:
          sparkAccount === undefined
            ? undefined
            : {
                accountId: sparkAccount.id,
                memo: `Payment ${amount} ${currency}`,
              },
      })
    )

    if (!result.ok) {
      console.error("Failed to create prepared payment", result.error)
      return
    }

    await navigate({
      to: "/activity/$paymentId",
      params: {
        paymentId: result.value,
      },
    })
  }

  return <TerminalPaymentKeypadWithSettings onCharge={handleCharge} />
}

function TerminalHomePage() {
  return (
    <>
      <Header />

      <Suspense fallback={null}>
        <TerminalPaymentKeypadLoader />
      </Suspense>
    </>
  )
}
