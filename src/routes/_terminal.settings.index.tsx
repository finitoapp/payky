import { createFileRoute } from "@tanstack/react-router"
import {
  ArrowDown,
  BadgeDollarSign,
  Bug,
  CircleDollarSign,
  Grid2X2,
  HeartHandshake,
  Info,
  Landmark,
  Languages,
  Plug,
  ReceiptText,
  ShieldCheck,
  ShoppingBag,
  SunMoon,
  UserRound,
} from "lucide-react"
import { type ComponentProps, useMemo } from "react"

import { FadeHeader } from "@/components/fade-header.tsx"
import { VerticalNav } from "@/components/vertial-nav.tsx"
import { useTranslation } from "@/hooks/use-translation.ts"
import type { TranslationKey } from "@/i18n/resources.ts"

export const Route = createFileRoute("/_terminal/settings/")({
  component: SettingsPage,
  staticData: {
    terminalLayout: {
      viewportClassName: "px-6 py-6",
    },
  },
})

type VerticalNavItem = ComponentProps<typeof VerticalNav>["items"][number]

interface SettingRow {
  readonly icon: typeof Grid2X2
  readonly title: TranslationKey
  readonly description: TranslationKey
  readonly to?: VerticalNavItem["to"]
}

const terminalSettings: ReadonlyArray<SettingRow> = [
  {
    icon: Grid2X2,
    title: "settings.items.title",
    description: "settings.items.description",
    to: "/settings/items",
  },
  {
    icon: BadgeDollarSign,
    title: "settings.tips.title",
    description: "settings.tips.description",
  },
  {
    icon: ShoppingBag,
    title: "settings.baskets.title",
    description: "settings.baskets.description",
  },
]

const accountSettings: ReadonlyArray<SettingRow> = [
  {
    icon: UserRound,
    title: "settings.accounts.nav.title",
    description: "settings.accounts.nav.description",
    to: "/settings/accounts",
  },
]

const generalSettings: ReadonlyArray<SettingRow> = [
  {
    icon: Languages,
    title: "settings.language.title",
    description: "settings.language.description",
    to: "/settings/language",
  },
  {
    icon: SunMoon,
    title: "settings.theme.title",
    description: "settings.theme.description",
    to: "/settings/theme",
  },
]

const supportSettings: ReadonlyArray<SettingRow> = [
  {
    icon: HeartHandshake,
    title: "settings.donations.title",
    description: "settings.donations.description",
    to: "/settings/donations",
  },
  {
    icon: Info,
    title: "settings.about.title",
    description: "settings.about.description",
    to: "/settings/about",
  },
]

const paymentSettings: ReadonlyArray<SettingRow> = [
  {
    icon: CircleDollarSign,
    title: "settings.defaultPaymentMethod.title",
    description: "settings.defaultPaymentMethod.description",
    to: "/settings/default-payment-method",
  },
  {
    icon: Landmark,
    title: "settings.paymentAccounts.title",
    description: "settings.paymentAccounts.description",
    to: "/settings/payment-accounts",
  },
  {
    icon: ArrowDown,
    title: "settings.fiat.title",
    description: "settings.fiat.description",
    to: "/settings/fiat",
  },
  {
    icon: ReceiptText,
    title: "settings.paymentNumberSeries.title",
    description: "settings.paymentNumberSeries.description",
    to: "/settings/payment-number-series",
  },
  {
    icon: Plug,
    title: "settings.fioPlugin.title",
    description: "settings.fioPlugin.description",
    to: "/settings/fio-plugin",
  },
]

const developerSettings: ReadonlyArray<SettingRow> = [
  {
    icon: Bug,
    title: "settings.debugConsole.title",
    description: "settings.debugConsole.description",
    to: "/settings/debug-console",
  },
]

function createSettingsNavItems(
  settings: ReadonlyArray<SettingRow>,
  t: (key: TranslationKey) => string
): ComponentProps<typeof VerticalNav>["items"] {
  return settings.map((item) => {
    const Icon = item.icon

    return {
      label: (
        <span className="flex flex-col gap-1">
          <span className="text-sm font-semibold">{t(item.title)}</span>
          <span className="text-xs leading-snug text-muted-foreground">
            {t(item.description)}
          </span>
        </span>
      ),
      to: item.to,
      icon: <Icon className="text-muted-foreground" />,
    }
  })
}

function SettingsPage() {
  const { t } = useTranslation()
  const accountItems = useMemo(
    () => createSettingsNavItems(accountSettings, t),
    [t]
  )
  const generalItems = useMemo(
    () => createSettingsNavItems(generalSettings, t),
    [t]
  )
  const supportItems = useMemo(
    () => createSettingsNavItems(supportSettings, t),
    [t]
  )
  const terminalItems = useMemo(
    () => createSettingsNavItems(terminalSettings, t),
    [t]
  )
  const paymentItems = useMemo(
    () => createSettingsNavItems(paymentSettings, t),
    [t]
  )
  const developerItems = useMemo(
    () => createSettingsNavItems(developerSettings, t),
    [t]
  )
  const securityItems = useMemo(
    () =>
      createSettingsNavItems(
        [
          {
            icon: ShieldCheck,
            title: "settings.security.title",
            description: "settings.security.description",
            to: "/settings/security",
          },
        ],
        t
      ),
    [t]
  )

  return (
    <>
      <div className="h-6" />
      <FadeHeader title={t("settings.title")} />

      <VerticalNav
        className={"hidden"}
        title={t("settings.terminal")}
        items={terminalItems}
      />
      <VerticalNav title={t("settings.payments")} items={paymentItems} />
      <VerticalNav
        title={t("settings.accountAndSync")}
        items={[...accountItems, ...securityItems]}
      />
      <VerticalNav title={t("settings.appearance")} items={generalItems} />
      <VerticalNav title={t("settings.support")} items={supportItems} />
      <VerticalNav title={t("settings.developers")} items={developerItems} />
    </>
  )
}
