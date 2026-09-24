import { Link, type LinkProps } from "@tanstack/react-router"
import {
  BanknoteIcon,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  LandmarkIcon,
  type LucideIcon,
  ZapIcon,
} from "lucide-react"

import { FadeHeader } from "@/components/fade-header.tsx"
import { Badge } from "@/components/ui/badge.tsx"
import { Button } from "@/components/ui/button.tsx"
import { verticalNavShellClassName } from "@/components/vertical-nav.tsx"
import {
  saveCashRegisterAccount,
  saveFiatBankAccount,
  saveSparkAccount,
} from "@/core/modules/account/account-actions.ts"
import {
  cashRegisterAccountQuery,
  fiatBankAccountQuery,
  sparkAccountQuery,
} from "@/core/modules/account/account-queries.ts"
import { setPaymentMethodOrder } from "@/core/modules/app-settings/app-settings-actions.ts"
import { settingsQuery } from "@/core/modules/app-settings/app-settings-queries.ts"
import type { DefaultPaymentMethod } from "@/core/modules/app-settings/app-settings-types.ts"
import { getPaymentMethodOrder } from "@/core/modules/app-settings/app-settings-utils.ts"
import { FiatCurrency } from "@/core/modules/shared/schema.ts"
import { InlineEditSwitch } from "@/features/settings/inline-edit-switch.tsx"
import { useAppRun } from "@/hooks/use-app-run.ts"
import { useEvoluQuery } from "@/hooks/use-evolu-query.ts"
import { useRunToast } from "@/hooks/use-run-toast.ts"
import { useTranslation } from "@/hooks/use-translation.ts"
import type { TranslationKey } from "@/i18n/resources.ts"
import { cn } from "@/lib/utils.ts"

interface PaymentMethodRowState {
  readonly icon: LucideIcon
  readonly title: TranslationKey
  readonly switchLabel: TranslationKey
  readonly enabled: boolean
  /** Enabled and offered on the payment screen for the app's currency. */
  readonly available: boolean
  readonly canEnable: boolean
  readonly status: string | null
  readonly to: LinkProps["to"] | null
  readonly saveEnabled: (enabled: boolean) => Promise<void>
}

/**
 * The payment methods in the order customers see them. There is no separate
 * default: the first available one is the tab the payment screen opens on.
 */
export function PaymentAccountsSettingsPage() {
  const appRun = useAppRun()
  const runToast = useRunToast()
  const { t } = useTranslation()
  const { data: settingsData } = useEvoluQuery(settingsQuery)
  const { data: bankData } = useEvoluQuery(fiatBankAccountQuery)
  const { data: sparkData } = useEvoluQuery(sparkAccountQuery)
  const { data: cashData } = useEvoluQuery(cashRegisterAccountQuery)
  const [settings] = settingsData
  const [bank] = bankData
  const [spark] = sparkData
  const [cash] = cashData

  const appCurrency = settings?.fiatCurrency ?? FiatCurrency.CZK
  const bankEnabled = bank !== undefined && bank.isDeleted !== 1
  const sparkEnabled = spark !== undefined && spark.isDeleted !== 1
  const cashEnabled = cash !== undefined && cash.isDeleted !== 1

  const currencyMismatch = (currency: FiatCurrency | undefined) =>
    currency === undefined || currency === appCurrency
      ? null
      : t("settings.paymentAccounts.status.currencyMismatch", {
          currency,
          appCurrency,
        })

  const rows = {
    iban: {
      icon: LandmarkIcon,
      title: "settings.paymentAccounts.method.iban",
      switchLabel: "settings.fiatBankAccount.enabled.label",
      enabled: bankEnabled,
      available: bankEnabled && bank.currency === appCurrency,
      // An account row only exists once an IBAN was entered, and enabling
      // without one would offer bank transfer with nowhere to send it.
      canEnable: bank !== undefined,
      status:
        bank === undefined
          ? t("settings.paymentAccounts.status.missingIban")
          : bankEnabled
            ? currencyMismatch(bank.currency)
            : null,
      to: "/settings/payment-accounts/iban",
      saveEnabled: async (enabled) => {
        if (bank === undefined) return
        await using run = appRun()
        await run.ok(
          saveFiatBankAccount({
            enabled,
            iban: bank.iban,
            currency: bank.currency,
            defaultQrFormat: bank.defaultQrFormat ?? "spayd",
          })
        )
      },
    },
    spark: {
      icon: ZapIcon,
      title: "settings.paymentAccounts.method.spark",
      switchLabel: "settings.sparkAccount.enabled.label",
      enabled: sparkEnabled,
      available: sparkEnabled,
      canEnable: true,
      status: null,
      // Before the first enable there is no wallet yet to show or change.
      to: spark === undefined ? null : "/settings/payment-accounts/spark",
      saveEnabled: async (enabled) => {
        await using run = appRun()
        await run.ok(saveSparkAccount({ enabled }))
      },
    },
    cashRegister: {
      icon: BanknoteIcon,
      title: "settings.paymentAccounts.method.cashRegister",
      switchLabel: "settings.cashRegisterAccount.enabled.label",
      enabled: cashEnabled,
      available: cashEnabled && cash.currency === appCurrency,
      canEnable: true,
      status: cashEnabled ? currencyMismatch(cash.currency) : null,
      to: null,
      saveEnabled: async (enabled) => {
        await using run = appRun()
        await run.ok(
          saveCashRegisterAccount({ enabled, currency: appCurrency })
        )
      },
    },
  } satisfies Record<DefaultPaymentMethod, PaymentMethodRowState>

  const order = getPaymentMethodOrder(settings)
  const firstAvailable = order.find((method) => rows[method].available)

  const move = (index: number, offset: -1 | 1) => {
    const method = order[index]
    const neighbour = order[index + offset]
    if (method === undefined || neighbour === undefined) return

    const nextOrder = order.with(index, neighbour).with(index + offset, method)
    void runToast(async (run) => {
      await run.ok(setPaymentMethodOrder(nextOrder))
    })
  }

  return (
    <>
      <div className="h-6" />
      <FadeHeader title={t("settings.paymentAccounts.title")} />
      <div className="flex flex-col gap-3">
        <p className="px-1 text-sm text-muted-foreground">
          {t("settings.paymentAccounts.order.description")}
        </p>
        <ul className={cn(verticalNavShellClassName, "divide-y")}>
          {order.map((method, index) => (
            <PaymentMethodRow
              key={method}
              row={rows[method]}
              isDefault={method === firstAvailable}
              canMoveUp={index > 0}
              canMoveDown={index < order.length - 1}
              onMove={(offset) => move(index, offset)}
            />
          ))}
        </ul>
      </div>
    </>
  )
}

function PaymentMethodRow({
  row,
  isDefault,
  canMoveUp,
  canMoveDown,
  onMove,
}: {
  readonly row: PaymentMethodRowState
  readonly isDefault: boolean
  readonly canMoveUp: boolean
  readonly canMoveDown: boolean
  readonly onMove: (offset: -1 | 1) => void
}) {
  const { t } = useTranslation()
  const name = t(row.title)
  const Icon = row.icon

  const content = (
    <>
      <Icon className="size-5 shrink-0 text-muted-foreground" />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span
          className={cn(
            "flex items-center gap-2 font-medium",
            !row.enabled && "text-muted-foreground"
          )}
        >
          {name}
          {isDefault && (
            <Badge variant="secondary">
              {t("settings.paymentAccounts.default")}
            </Badge>
          )}
        </span>
        {row.status !== null && (
          <span className="text-xs text-muted-foreground">{row.status}</span>
        )}
      </span>
    </>
  )

  return (
    <li className="flex items-center gap-2 py-1 pr-3 pl-1 text-sm">
      <span className="flex flex-col">
        <Button
          type="button"
          variant="ghost"
          size="icon-lg"
          disabled={!canMoveUp}
          aria-label={t("settings.paymentAccounts.moveUp.aria", { name })}
          onClick={() => onMove(-1)}
        >
          <ChevronUp className="size-6" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-lg"
          disabled={!canMoveDown}
          aria-label={t("settings.paymentAccounts.moveDown.aria", { name })}
          onClick={() => onMove(1)}
        >
          <ChevronDown className="size-6" />
        </Button>
      </span>
      {row.to === null ? (
        <span className="flex min-w-0 flex-1 items-center gap-3 py-2">
          {content}
        </span>
      ) : (
        <Link
          to={row.to}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-md py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {content}
          <ChevronRight className="size-4 shrink-0" />
        </Link>
      )}
      <span className="shrink-0">
        <InlineEditSwitch
          label={t(row.switchLabel)}
          defaultValue={row.enabled}
          disabled={!row.canEnable}
          showText={false}
          showSaved={false}
          onSave={row.saveEnabled}
        />
      </span>
    </li>
  )
}
