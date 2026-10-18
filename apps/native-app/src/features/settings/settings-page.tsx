import { Text, YStack } from "tamagui"
import { languageOptions } from "../../components/language-options.ts"
import { Screen } from "../../components/screen.tsx"
import { ScreenHeader } from "../../components/screen-header.tsx"
import { useTranslation } from "../../hooks/use-translation.ts"
import { SettingsRow, type SettingsRowData } from "./settings-row.tsx"

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
  const appearanceRows: ReadonlyArray<SettingsRowData> = [
    {
      title: t("settings.language.title"),
      value: languageOptions.find((option) => option.value === language)?.label,
      href: "/settings/language",
    },
  ]

  return (
    <Screen>
      <ScreenHeader title={t("settings.title")} />
      <SettingsGroup title={t("settings.appearance")} rows={appearanceRows} />
    </Screen>
  )
}
