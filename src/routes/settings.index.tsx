import { createFileRoute } from "@tanstack/react-router"
import {
  ArrowDown,
  BadgeDollarSign,
  Grid2X2,
  Landmark,
  Link2,
  ShoppingBag,
  WalletCards,
  Zap,
} from "lucide-react"
import { type ComponentProps, useMemo } from "react"

import { FadeHeader } from "@/components/fade-header.tsx"
import { PhoneViewport } from "@/components/numopay-skeleton.tsx"
import { VerticalNav } from "@/components/vertial-nav.tsx"
import type { TranslationKey } from "@/i18n/resources.ts"
import { useTranslation } from "@/i18n/use-translation.ts"

export const Route = createFileRoute("/settings/")({
  component: SettingsPage,
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

const paymentSettings: ReadonlyArray<SettingRow> = [
  {
    icon: WalletCards,
    title: "settings.defaultPayment.title",
    description: "settings.defaultPayment.description",
  },
  {
    icon: ArrowDown,
    title: "settings.fiat.title",
    description: "settings.fiat.description",
  },
  {
    icon: Landmark,
    title: "settings.mints.title",
    description: "settings.mints.description",
  },
  {
    icon: Link2,
    title: "settings.webhooks.title",
    description: "settings.webhooks.description",
  },
  {
    icon: Zap,
    title: "settings.withdrawals.title",
    description: "settings.withdrawals.description",
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
  const terminalItems = useMemo(
    () => createSettingsNavItems(terminalSettings, t),
    [t]
  )
  const paymentItems = useMemo(
    () => createSettingsNavItems(paymentSettings, t),
    [t]
  )
  const securityItems = useMemo(
    () =>
      createSettingsNavItems(
        [
          {
            icon: Landmark,
            title: "settings.security.title",
            description: "settings.security.description",
          },
        ],
        t
      ),
    [t]
  )

  return (
    <main className="min-h-svh bg-background text-foreground">
      <PhoneViewport className="px-6 py-6">
        <div className="h-6" />
        <FadeHeader title={t("settings.title")} />

        <VerticalNav title={t("settings.terminal")} items={terminalItems} />
        <VerticalNav title={t("settings.payments")} items={paymentItems} />
        <VerticalNav title={t("settings.security")} items={securityItems} />
      </PhoneViewport>
    </main>
  )
}
