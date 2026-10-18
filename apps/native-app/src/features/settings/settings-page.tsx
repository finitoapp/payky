import { sqliteTrue } from "@evolu/common"
import { countryLabelKey } from "@payky/app-shared/legal-entity-options"
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
      <SettingsGroup title={t("settings.appearance")} rows={appearanceRows} />
    </Screen>
  )
}
