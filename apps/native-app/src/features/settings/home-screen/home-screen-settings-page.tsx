import type { TranslationKey } from "@payky/app-shared/i18n/resources"
import { setEnabledHomeModes } from "@payky/core/modules/app-settings/app-settings-actions"
import { settingsQuery } from "@payky/core/modules/app-settings/app-settings-queries"
import type { TerminalHomeMode } from "@payky/core/modules/app-settings/app-settings-types"
import {
  parseEnabledHomeModes,
  terminalHomeModes,
} from "@payky/core/modules/app-settings/app-settings-utils"
import { Switch } from "react-native"
import { Text, XStack, YStack } from "tamagui"
import { Screen } from "../../../components/screen.tsx"
import { ScreenHeader } from "../../../components/screen-header.tsx"
import { useEvoluQuery } from "../../../hooks/use-evolu-query.ts"
import { useRunToast } from "../../../hooks/use-run-toast.ts"
import { useTranslation } from "../../../hooks/use-translation.ts"

export const homeModeLabelKeys = {
  numpad: "nav.numpad",
  pos: "nav.pos",
} satisfies Record<TerminalHomeMode, TranslationKey>

const homeModeDescriptionKeys = {
  numpad: "settings.homeScreen.numpad.description",
  pos: "settings.homeScreen.pos.description",
} satisfies Record<TerminalHomeMode, TranslationKey>

/**
 * Which home modes are on offer (settings/0001), as web's
 * `HomeScreenSettingsPage`. Switching off the last one is let through to the
 * write, so its refusal can say why instead of the switch just not moving.
 */
export function HomeScreenSettingsPage() {
  const { t } = useTranslation()
  const runToast = useRunToast()
  const [settings] = useEvoluQuery(settingsQuery).data
  const enabledModes = parseEnabledHomeModes(settings?.enabledHomeModesJson)

  const toggle = (mode: TerminalHomeMode, checked: boolean) =>
    runToast(async (run) => {
      const result = await run(
        setEnabledHomeModes(
          checked
            ? [...enabledModes, mode]
            : enabledModes.filter((enabled) => enabled !== mode)
        )
      )
      return result.ok ? undefined : "settings.homeScreen.atLeastOneMode"
    })

  return (
    <Screen>
      <ScreenHeader title={t("settings.homeScreen.title")} />
      <YStack gap="3">
        <Text fontWeight="700">{t("settings.homeScreen.modes.title")}</Text>
        <Text color="muted-foreground">
          {t("settings.homeScreen.modes.description")}
        </Text>
        {terminalHomeModes.map((mode) => (
          <XStack key={mode} gap="3" items="center">
            <Switch
              accessibilityLabel={t(homeModeLabelKeys[mode])}
              value={enabledModes.includes(mode)}
              onValueChange={async (checked) => {
                await toggle(mode, checked)
              }}
            />
            <YStack flex={1}>
              <Text fontWeight="600">{t(homeModeLabelKeys[mode])}</Text>
              <Text fontSize={13} color="muted-foreground">
                {t(homeModeDescriptionKeys[mode])}
              </Text>
            </YStack>
          </XStack>
        ))}
      </YStack>
    </Screen>
  )
}
