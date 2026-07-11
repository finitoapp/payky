import { sqliteTrue } from "@evolu/common"
import { createFileRoute, Link } from "@tanstack/react-router"
import { useAtomValue } from "jotai"
import { CheckCircle2, CircleAlert } from "lucide-react"

import { accountAtom } from "@/atoms/account.ts"
import { FadeHeader } from "@/components/fade-header.tsx"
import { Badge } from "@/components/ui/badge.tsx"
import { Button } from "@/components/ui/button.tsx"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx"
import {
  cashRegisterAccountQuery,
  fiatBankAccountQuery,
  sparkAccountQuery,
} from "@/core/modules/account/account-queries.ts"
import { settingsQuery } from "@/core/modules/app-settings/app-settings-queries.ts"
import { getDefaultPaymentMethod } from "@/core/modules/app-settings/app-settings-utils.ts"
import { fiatBankAccountFioPluginQuery } from "@/core/modules/fio-plugin/fio-plugin-queries.ts"
import { FiatCurrency } from "@/core/modules/shared/schema.ts"
import {
  createReadinessItems,
  isPaymentMethodAvailable,
} from "@/features/settings/readiness/readiness-utils.ts"
import { accountTransportsQuery } from "@/features/settings/security/transport-toggle-list.tsx"
import { useDeviceEvoluQuery } from "@/hooks/use-device-evolu-query.ts"
import { useEvoluQuery } from "@/hooks/use-evolu-query.ts"
import { useTranslation } from "@/hooks/use-translation.ts"

export const Route = createFileRoute("/_terminal/settings/readiness")({
  component: ReadinessPage,
  staticData: {
    terminalLayout: {
      viewportClassName: "px-5 py-6",
    },
  },
})

function ReadinessPage() {
  const { t } = useTranslation()
  const account = useAtomValue(accountAtom)
  const { data: transports } = useDeviceEvoluQuery(
    accountTransportsQuery(account.id)
  )
  const { data: settingsData } = useEvoluQuery(settingsQuery)
  const { data: fiatBankAccountData } = useEvoluQuery(fiatBankAccountQuery)
  const { data: sparkAccountData } = useEvoluQuery(sparkAccountQuery)
  const { data: cashRegisterAccountData } = useEvoluQuery(
    cashRegisterAccountQuery
  )
  const { data: fioPluginData } = useEvoluQuery(fiatBankAccountFioPluginQuery)
  const [settings] = settingsData
  const [fiatBankAccount] = fiatBankAccountData
  const [sparkAccount] = sparkAccountData
  const [cashRegisterAccount] = cashRegisterAccountData
  const [fioPlugin] = fioPluginData
  const fiatCurrency = settings?.fiatCurrency ?? FiatCurrency.CZK
  const hasActiveFiatBankAccount =
    fiatBankAccount !== undefined &&
    fiatBankAccount.isDeleted !== 1 &&
    fiatBankAccount.currency === fiatCurrency
  const hasActiveSparkAccount =
    sparkAccount !== undefined && sparkAccount.isDeleted !== 1
  const hasActiveCashRegisterAccount =
    cashRegisterAccount !== undefined &&
    cashRegisterAccount.isDeleted !== 1 &&
    cashRegisterAccount.currency === fiatCurrency
  const defaultPaymentMethod = getDefaultPaymentMethod(
    settings?.defaultPaymentMethod
  )
  const items = createReadinessItems({
    hasRecoveryPhrase: account.mnemonic.trim().length > 0,
    hasActiveSyncTransport: transports.some(
      (transport) => transport.isActive === sqliteTrue
    ),
    hasActiveSparkAccount,
    hasActiveCashRegisterAccount,
    hasActiveFiatBankAccount,
    hasDefaultPaymentMethod: settings?.defaultPaymentMethod != null,
    isDefaultPaymentMethodAvailable: isPaymentMethodAvailable({
      method: defaultPaymentMethod,
      hasActiveSparkAccount,
      hasActiveCashRegisterAccount,
      hasActiveFiatBankAccount,
    }),
    hasActiveFioPlugin: fioPlugin?.isActive === sqliteTrue,
  })
  const completedCount = items.filter((item) => item.completed).length

  return (
    <>
      <div className="h-6" />
      <FadeHeader title={t("settings.readiness.title")} />
      <Card>
        <CardHeader>
          <CardTitle>{t("settings.readiness.summary.title")}</CardTitle>
          <CardDescription>
            {t("settings.readiness.summary.description")}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="text-sm text-muted-foreground">
            {t("settings.readiness.progress", {
              completed: completedCount.toString(),
              total: items.length.toString(),
            })}
          </div>
          <ul className="flex flex-col gap-3">
            {items.map((item) => (
              <li
                key={item.id}
                className="flex items-start gap-3 rounded-lg border p-3"
              >
                {item.completed ? (
                  <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-green-600" />
                ) : (
                  <CircleAlert className="mt-0.5 size-5 shrink-0 text-amber-600" />
                )}
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{t(item.title)}</span>
                    <Badge variant={item.completed ? "secondary" : "outline"}>
                      {item.completed
                        ? t("settings.readiness.status.completed")
                        : t("settings.readiness.status.notCompleted")}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {t(item.description)}
                  </p>
                  {!item.completed && (
                    <Button
                      className="w-fit"
                      variant="outline"
                      size="sm"
                      nativeButton={false}
                      render={<Link to={item.actionTo} />}
                    >
                      {t(item.actionLabel)}
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </>
  )
}
