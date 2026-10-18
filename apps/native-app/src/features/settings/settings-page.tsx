import { sqliteTrue } from "@evolu/common"
import { countryLabelKey } from "@payky/app-shared/legal-entity-options"
import {
  cardSwitchioAccountQuery,
  cashRegisterAccountQuery,
  fiatBankAccountQuery,
  sparkAccountQuery,
} from "@payky/core/modules/account/account-queries"
import { settingsQuery } from "@payky/core/modules/app-settings/app-settings-queries"
import {
  getFiatCurrency,
  parseEnabledHomeModes,
} from "@payky/core/modules/app-settings/app-settings-utils"
import { legalEntityQuery } from "@payky/core/modules/legal-entity/legal-entity-queries"
import { Text, YStack } from "tamagui"
import { languageOptions } from "../../components/language-options.ts"
import { Screen } from "../../components/screen.tsx"
import { ScreenHeader } from "../../components/screen-header.tsx"
import { useEvoluQuery } from "../../hooks/use-evolu-query.ts"
import { useThemePreference } from "../../hooks/use-theme-preference.ts"
import { useTranslation } from "../../hooks/use-translation.ts"
import { useEetSettings } from "../shared/use-eet-settings.ts"
import { homeModeLabelKeys } from "./home-screen/home-screen-settings-page.tsx"
import {
  useNostrIdentity,
  useNostrProfile,
} from "./profile/use-nostr-profile.ts"
import { SettingsRow, type SettingsRowData } from "./settings-row.tsx"
import { themeLabelKeys } from "./theme/theme-settings-page.tsx"

function SettingsGroup({
  title,
  rows,
}: {
  readonly title: string
  readonly rows: ReadonlyArray<SettingsRowData>
}) {
  // A group none of whose destinations exist natively yet is not shown.
  if (rows.length === 0) return null
  return (
    <YStack gap="2">
      <Text fontSize={12} fontWeight="700" color="muted-foreground">
        {title}
      </Text>
      {rows.map((row) => (
        <SettingsRow key={row.href} {...row} />
      ))}
    </YStack>
  )
}

/**
 * The settings menu, like web's `SettingsPage` but listing only what exists
 * natively: web's groups, in web's order. Each later settings task adds its
 * row to its group: catalog (items, categories, tables), payments, taxes,
 * account and sync, and support rows stay unlisted until their screens land.
 * The route is `free`; each destination carries its own gate.
 */
export function SettingsPage() {
  const { language, t } = useTranslation()
  const theme = useThemePreference()
  const profile = useNostrProfile(useNostrIdentity().pubkey)
  const [settings] = useEvoluQuery(settingsQuery).data
  const [legalEntity] = useEvoluQuery(legalEntityQuery).data
  const [cash] = useEvoluQuery(cashRegisterAccountQuery).data
  const [bank] = useEvoluQuery(fiatBankAccountQuery).data
  const eet = useEetSettings()
  const [spark] = useEvoluQuery(sparkAccountQuery).data
  const [card] = useEvoluQuery(cardSwitchioAccountQuery).data
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
  const enabledHomeModes = parseEnabledHomeModes(settings?.enabledHomeModesJson)
  const fiatCurrency = getFiatCurrency(settings)
  const catalogRows: ReadonlyArray<SettingsRowData> = [
    { title: t("settings.items.title"), href: "/settings/items" },
    { title: t("settings.categories.title"), href: "/settings/categories" },
    { title: t("settings.tables.title"), href: "/settings/tables" },
  ]
  const paymentRows: ReadonlyArray<SettingsRowData> = [
    {
      title: t("settings.legalEntity.title"),
      value:
        legalEntity === undefined
          ? fiatCurrency
          : `${t(countryLabelKey(legalEntity.country))} · ${fiatCurrency}`,
      href: "/settings/legal-entity",
    },
    {
      title: t("settings.paymentAccounts.title"),
      value: paymentMethodsValue,
      href: "/settings/payment-accounts",
    },
    {
      title: t("settings.eet.title"),
      value: t(
        !eet.isEnabled
          ? "settings.eet.nav.off"
          : eet.isSandboxActive
            ? "settings.eet.nav.sandbox"
            : "settings.eet.nav.production"
      ),
      href: "/settings/eet",
    },
    {
      title: t("settings.tips.title"),
      value: t(
        settings?.tipsEnabled === sqliteTrue
          ? "settings.tips.nav.on"
          : "settings.tips.nav.off"
      ),
      href: "/settings/tips",
    },
  ]
  const taxRows: ReadonlyArray<SettingsRowData> = [
    { title: t("settings.taxRates.title"), href: "/settings/tax-rates" },
    {
      title: t("settings.paymentNumberSeries.title"),
      href: "/settings/payment-number-series",
    },
  ]
  const accountRows: ReadonlyArray<SettingsRowData> = [
    {
      title: t("settings.accounts.nav.title"),
      value: t("settings.accounts.nav.description"),
      href: "/settings/accounts",
    },
    {
      title: t("settings.security.title"),
      value: t("settings.security.description"),
      href: "/settings/security",
    },
    { title: t("access.title"), href: "/settings/access" },
  ]
  const appearanceRows: ReadonlyArray<SettingsRowData> = [
    {
      title: t("settings.language.title"),
      value: languageOptions.find((option) => option.value === language)?.label,
      href: "/settings/language",
    },
    {
      title: t("settings.theme.title"),
      value: t(themeLabelKeys[theme]),
      href: "/settings/theme",
    },
    {
      title: t("settings.homeScreen.title"),
      value: enabledHomeModes
        .map((mode) => t(homeModeLabelKeys[mode]))
        .join(", "),
      href: "/settings/home-screen",
    },
  ]
  const supportRows: ReadonlyArray<SettingsRowData> = [
    {
      title: t("settings.donations.title"),
      value: t("settings.donations.description"),
      href: "/settings/donations",
    },
    {
      title: t("settings.about.title"),
      value: t("settings.about.description"),
      href: "/settings/about",
    },
  ]

  return (
    <Screen>
      <ScreenHeader title={t("settings.title")} />
      <SettingsRow
        title={t("settings.profile.title")}
        value={profile.data?.name ?? t("settings.profile.setName")}
        href="/settings/profile"
      />
      <SettingsGroup title={t("settings.catalog")} rows={catalogRows} />
      <SettingsGroup title={t("settings.payments")} rows={paymentRows} />
      <SettingsGroup title={t("settings.taxesGroup")} rows={taxRows} />
      <SettingsGroup title={t("settings.accountAndSync")} rows={accountRows} />
      <SettingsGroup title={t("settings.appearance")} rows={appearanceRows} />
      <SettingsGroup title={t("settings.support")} rows={supportRows} />
    </Screen>
  )
}
