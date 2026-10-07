import { sqliteTrue } from "@evolu/common"
import { createFileRoute } from "@tanstack/react-router"
import {
  BadgeDollarSign,
  Building2,
  FolderIcon,
  type Grid2X2,
  HeartHandshake,
  House,
  Info,
  Landmark,
  Languages,
  LifeBuoy,
  Percent,
  ReceiptText,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Stamp,
  SunMoon,
  Table2Icon,
  UserRound,
} from "lucide-react"
import type { ComponentProps } from "react"

import { FadeHeader } from "@/components/fade-header.tsx"
import { type Theme, useTheme } from "@/components/theme-provider.tsx"
import { type NavLinkTo, VerticalNav } from "@/components/vertical-nav.tsx"
import {
  cardSwitchioAccountQuery,
  cashRegisterAccountQuery,
  fiatBankAccountQuery,
  sparkAccountQuery,
} from "@/core/modules/account/account-queries.ts"
import { settingsQuery } from "@/core/modules/app-settings/app-settings-queries.ts"
import { legalEntityQuery } from "@/core/modules/legal-entity/legal-entity-queries.ts"
import { FiatCurrency } from "@/core/modules/shared/schema.ts"
import { homeModeLabelKeys } from "@/features/settings/home-screen/home-screen-settings-page.tsx"
import { ProfileCard } from "@/features/settings/profile/profile-card.tsx"
import { languageOptions } from "@/features/shared/language-options.ts"
import { useEetSettings } from "@/features/shared/use-eet-settings.ts"
import { StationSettingsPage } from "@/features/station/station-settings-page.tsx"
import { useIsStation } from "@/hooks/use-account-kind.ts"
import { useAiAssistantAccess } from "@/hooks/use-ai-assistant-access.ts"
import { useEvoluQuery } from "@/hooks/use-evolu-query.ts"
import { useTerminalHomeMode } from "@/hooks/use-terminal-home-mode.ts"
import { useTranslation } from "@/hooks/use-translation.ts"
import type { TranslationKey } from "@/i18n/resources.ts"

export const Route = createFileRoute("/_terminal/settings/")({
  component: SettingsRoute,
  staticData: {
    terminalLayout: {
      viewportClassName: "px-3 py-6",
    },
  },
})

/** A PoS station has settings of its own; the owner's are not its to see. */
function SettingsRoute() {
  return useIsStation() ? <StationSettingsPage /> : <SettingsPage />
}

/**
 * A row shows either a `description` of what the page is for or, for pages
 * holding a single current choice, that choice as `value` — so the list reads
 * as a summary without opening anything.
 */
interface SettingRow {
  readonly icon: typeof Grid2X2
  readonly title: TranslationKey
  readonly description?: TranslationKey
  readonly value?: string
  readonly to: NavLinkTo
}

const themeValueKeys = {
  light: "settings.theme.light.title",
  dark: "settings.theme.dark.title",
  system: "settings.theme.system.title",
} satisfies Record<Theme, TranslationKey>

function createSettingsNavItems(
  settings: ReadonlyArray<SettingRow>,
  t: (key: TranslationKey) => string
): ComponentProps<typeof VerticalNav>["items"] {
  return settings.map((item) => {
    const Icon = item.icon

    return {
      kind: "link" as const,
      label: (
        // Wraps rather than truncates: a value that does not fit beside the
        // title drops below it, right-aligned.
        <span className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <span className="flex min-w-0 flex-col gap-1">
            <span className="text-sm font-semibold">{t(item.title)}</span>
            {item.description === undefined ? null : (
              <span className="text-xs leading-snug text-muted-foreground">
                {t(item.description)}
              </span>
            )}
          </span>
          {item.value === undefined ? null : (
            <span className="ml-auto max-w-full truncate text-sm text-muted-foreground">
              {item.value}
            </span>
          )}
        </span>
      ),
      to: item.to,
      icon: <Icon className="size-5 text-muted-foreground" />,
    }
  })
}

function SettingsPage() {
  const { language, t } = useTranslation()
  const { theme } = useTheme()
  const [settings] = useEvoluQuery(settingsQuery).data
  const [legalEntity] = useEvoluQuery(legalEntityQuery).data
  const [cash] = useEvoluQuery(cashRegisterAccountQuery).data
  const [bank] = useEvoluQuery(fiatBankAccountQuery).data
  const [spark] = useEvoluQuery(sparkAccountQuery).data
  const [card] = useEvoluQuery(cardSwitchioAccountQuery).data
  const eet = useEetSettings()
  const { enabledModes: enabledHomeModes } = useTerminalHomeMode()
  const aiAssistantAccess = useAiAssistantAccess()

  const enabledMethods = [
    [cash, "settings.paymentAccounts.method.cashRegister"],
    [bank, "settings.paymentAccounts.method.iban"],
    [spark, "settings.paymentAccounts.method.spark"],
    [card, "settings.paymentAccounts.method.cardSwitchio"],
  ] as const
  const paymentMethodsValue =
    enabledMethods
      .filter(([account]) => account !== undefined && account.isDeleted !== 1)
      .map(([, key]) => t(key))
      .join(", ") || t("settings.paymentAccounts.nav.none")

  const fiatCurrency = settings?.fiatCurrency ?? FiatCurrency.CZK
  const businessValue =
    legalEntity === undefined
      ? fiatCurrency
      : `${t(
          legalEntity.country === null
            ? "country.other"
            : `country.${legalEntity.country.toLowerCase() as "cz" | "sk"}`
        )} · ${fiatCurrency}`

  const catalogItems = createSettingsNavItems(
    [
      {
        icon: ShoppingBag,
        title: "settings.items.title",
        description: "settings.items.description",
        to: "/settings/items",
      },
      {
        icon: FolderIcon,
        title: "settings.categories.title",
        description: "settings.categories.description",
        to: "/settings/categories",
      },
      {
        icon: Table2Icon,
        title: "settings.tables.title",
        description: "settings.tables.description",
        to: "/settings/tables",
      },
    ],
    t
  )
  const paymentItems = createSettingsNavItems(
    [
      {
        icon: Building2,
        title: "settings.legalEntity.title",
        value: businessValue,
        to: "/settings/legal-entity",
      },
      {
        icon: Landmark,
        title: "settings.paymentAccounts.title",
        value: paymentMethodsValue,
        to: "/settings/payment-accounts",
      },
      {
        icon: BadgeDollarSign,
        title: "settings.tips.title",
        value: t(
          settings?.tipsEnabled === sqliteTrue
            ? "settings.tips.nav.on"
            : "settings.tips.nav.off"
        ),
        to: "/settings/tips",
      },
    ],
    t
  )
  const taxItems = createSettingsNavItems(
    [
      {
        icon: Percent,
        title: "settings.taxRates.title",
        description: "settings.taxRates.nav.description",
        to: "/settings/tax-rates",
      },
      {
        icon: ReceiptText,
        title: "settings.paymentNumberSeries.title",
        description: "settings.paymentNumberSeries.description",
        to: "/settings/payment-number-series",
      },
      {
        icon: Stamp,
        title: "settings.eet.title",
        value: t(
          !eet.isEnabled
            ? "settings.eet.nav.off"
            : eet.isSandboxActive
              ? "settings.eet.nav.sandbox"
              : "settings.eet.nav.production"
        ),
        to: "/settings/eet",
      },
    ],
    t
  )
  const accountItems = createSettingsNavItems(
    [
      {
        icon: UserRound,
        title: "settings.accounts.nav.title",
        description: "settings.accounts.nav.description",
        to: "/settings/accounts",
      },
      {
        icon: ShieldCheck,
        title: "settings.security.title",
        description: "settings.security.description",
        to: "/settings/security",
      },
    ],
    t
  )
  const appearanceItems = createSettingsNavItems(
    [
      {
        icon: Languages,
        title: "settings.language.title",
        value: languageOptions.find((option) => option.value === language)
          ?.label,
        to: "/settings/language",
      },
      {
        icon: SunMoon,
        title: "settings.theme.title",
        value: t(themeValueKeys[theme]),
        to: "/settings/theme",
      },
      {
        icon: House,
        title: "settings.homeScreen.title",
        value: enabledHomeModes
          .map((mode) => t(homeModeLabelKeys[mode]))
          .join(", "),
        to: "/settings/home-screen",
      },
    ],
    t
  )
  const supportItems = createSettingsNavItems(
    [
      {
        icon: LifeBuoy,
        title: "settings.supportChat.title",
        description: "settings.supportChat.description",
        to: "/settings/support",
      },
      // Only on a device that allowed it, in the privacy settings (ai/0004).
      ...(aiAssistantAccess === "off"
        ? []
        : [
            {
              icon: Sparkles,
              title: "settings.assistant.title",
              description: "settings.assistant.description",
              to: "/settings/assistant",
            } as const,
          ]),
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
    ],
    t
  )

  return (
    <>
      <div className="h-6" />
      <FadeHeader title={t("settings.title")} />

      <ProfileCard />

      <VerticalNav title={t("settings.catalog")} items={catalogItems} />
      <VerticalNav title={t("settings.payments")} items={paymentItems} />
      <VerticalNav title={t("settings.taxesGroup")} items={taxItems} />
      <VerticalNav title={t("settings.accountAndSync")} items={accountItems} />
      <VerticalNav title={t("settings.appearance")} items={appearanceItems} />
      <VerticalNav title={t("settings.support")} items={supportItems} />
    </>
  )
}
