import { createFileRoute, Link } from "@tanstack/react-router"
import {
  BanknoteIcon,
  CoinsIcon,
  LandmarkIcon,
  type LucideIcon,
  ZapIcon,
} from "lucide-react"

import { FadeHeader } from "@/components/fade-header.tsx"
import { OptionToggleGroup } from "@/components/option-toggle-group.tsx"
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
  cashuAccountQuery,
  fiatBankAccountQuery,
  sparkAccountQuery,
} from "@/core/modules/account/account-queries.ts"
import { updateSettings } from "@/core/modules/app-settings/app-settings-actions.ts"
import { settingsQuery } from "@/core/modules/app-settings/app-settings-queries.ts"
import type { DefaultPaymentMethod } from "@/core/modules/app-settings/app-settings-types.ts"
import { getDefaultPaymentMethod } from "@/core/modules/app-settings/app-settings-utils.ts"
import { FiatCurrency } from "@/core/modules/shared/schema.ts"
import { useSettingsForm } from "@/features/settings/use-settings-form.ts"
import { useAppRun } from "@/hooks/use-app-run.ts"
import { useEvoluQuery } from "@/hooks/use-evolu-query.ts"
import { useTranslation } from "@/hooks/use-translation.ts"
import type { TranslationKey } from "@/i18n/resources.ts"

export const Route = createFileRoute(
  "/_terminal/settings/default-payment-method"
)({
  component: DefaultPaymentMethodPage,
  staticData: {
    terminalLayout: {
      viewportClassName: "px-3 py-6",
    },
  },
})

interface DefaultPaymentMethodOption {
  readonly value: DefaultPaymentMethod
  readonly label: TranslationKey
  readonly description: TranslationKey
  readonly icon: LucideIcon
}

const defaultPaymentMethodOptions: ReadonlyArray<DefaultPaymentMethodOption> = [
  {
    value: "iban",
    label: "settings.defaultPaymentMethod.iban.title",
    description: "settings.defaultPaymentMethod.iban.description",
    icon: LandmarkIcon,
  },
  {
    value: "spark",
    label: "settings.defaultPaymentMethod.spark.title",
    description: "settings.defaultPaymentMethod.spark.description",
    icon: ZapIcon,
  },
  {
    value: "cashu",
    label: "settings.defaultPaymentMethod.cashu.title",
    description: "settings.defaultPaymentMethod.cashu.description",
    icon: CoinsIcon,
  },
  {
    value: "cashRegister",
    label: "settings.defaultPaymentMethod.cashRegister.title",
    description: "settings.defaultPaymentMethod.cashRegister.description",
    icon: BanknoteIcon,
  },
]

function DefaultPaymentMethodPage() {
  const appRun = useAppRun()
  const { t } = useTranslation()
  const { pending, saved, resetSaved, submit } = useSettingsForm()
  const { data: settingsData } = useEvoluQuery(settingsQuery)
  const { data: fiatBankAccountData } = useEvoluQuery(fiatBankAccountQuery)
  const { data: sparkAccountData } = useEvoluQuery(sparkAccountQuery)
  const { data: cashuAccountData } = useEvoluQuery(cashuAccountQuery)
  const { data: cashRegisterAccountData } = useEvoluQuery(
    cashRegisterAccountQuery
  )
  const [settings] = settingsData
  const [fiatBankAccount] = fiatBankAccountData
  const [sparkAccount] = sparkAccountData
  const [cashuAccount] = cashuAccountData
  const [cashRegisterAccount] = cashRegisterAccountData
  const fiatCurrency = settings?.fiatCurrency ?? FiatCurrency.CZK
  const configuredDefaultMethod = getDefaultPaymentMethod(
    settings?.defaultPaymentMethod
  )
  // A `satisfies Record`, not a switch: the trailing `return false` a switch
  // needs is exactly what stops the compiler from demanding every member, so a
  // fourth payment method would compile and silently never show up here.
  const methodIsEnabled = {
    iban:
      fiatBankAccount !== undefined &&
      fiatBankAccount.isDeleted !== 1 &&
      fiatBankAccount.currency === fiatCurrency,
    spark: sparkAccount !== undefined && sparkAccount.isDeleted !== 1,
    cashu: cashuAccount !== undefined && cashuAccount.isDeleted !== 1,
    cashRegister:
      cashRegisterAccount !== undefined &&
      cashRegisterAccount.isDeleted !== 1 &&
      cashRegisterAccount.currency === fiatCurrency,
  } satisfies Record<DefaultPaymentMethod, boolean>
  const enabledOptions = defaultPaymentMethodOptions.filter(
    (option) => methodIsEnabled[option.value]
  )
  const selectedMethod = enabledOptions.some(
    (option) => option.value === configuredDefaultMethod
  )
    ? configuredDefaultMethod
    : null

  const saveDefaultPaymentMethod = async (method: DefaultPaymentMethod) => {
    resetSaved()

    await submit(async () => {
      await using run = appRun()

      await run(updateSettings({ defaultPaymentMethod: method }))
    })
  }

  return (
    <>
      <div className="h-6" />
      <FadeHeader title={t("settings.defaultPaymentMethod.title")} />

      <Card>
        <CardHeader>
          <CardTitle>{t("settings.defaultPaymentMethod.mode.title")}</CardTitle>
          <CardDescription>
            {selectedMethod === null && enabledOptions.length > 0
              ? t("settings.defaultPaymentMethod.mode.disabledDescription")
              : t("settings.defaultPaymentMethod.mode.description")}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {enabledOptions.length > 0 ? (
            <>
              <OptionToggleGroup
                value={selectedMethod}
                options={enabledOptions.map((option) => ({
                  value: option.value,
                  icon: option.icon,
                  title: t(option.label),
                  description: t(option.description),
                }))}
                disabled={pending}
                onChange={(nextMethod) => {
                  if (pending) return

                  void saveDefaultPaymentMethod(nextMethod)
                }}
              />
              <p className="text-sm text-muted-foreground" aria-live="polite">
                {saved ? t("settings.defaultPaymentMethod.saved") : null}
              </p>
            </>
          ) : (
            <div className="flex flex-col gap-4">
              <p className="text-sm text-muted-foreground">
                {t("settings.defaultPaymentMethod.empty")}
              </p>
              <Button
                className="w-fit"
                nativeButton={false}
                render={<Link to="/settings/payment-accounts" />}
              >
                {t("settings.defaultPaymentMethod.empty.action")}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  )
}
