import { sqliteTrue } from "@evolu/common"
import { settingsQuery } from "@payky/core/modules/app-settings/app-settings-queries"
import { getFiatCurrency } from "@payky/core/modules/app-settings/app-settings-utils"
import { Redirect } from "expo-router"
import { SafeAreaView } from "react-native-safe-area-context"
import { useTheme, XStack } from "tamagui"
import { AppButton } from "../../components/app-button.tsx"
import { useEvoluQuery } from "../../hooks/use-evolu-query.ts"
import { useTranslation } from "../../hooks/use-translation.ts"
import { AmountKeypad } from "./amount-keypad.tsx"
import { useTerminalHomeMode } from "./use-terminal-home-mode.ts"

const modeLabelKeys = {
  numpad: "nav.numpad",
  pos: "nav.pos",
} as const

/**
 * The root screen, like web's `_terminal/` index: an account without its
 * appSettings row is not onboarded and goes to onboarding (a restore runs
 * its own sync screen first, so no initial-sync wait is needed here).
 */
export function TerminalHomePage() {
  const theme = useTheme()
  const { t } = useTranslation()
  const [settings] = useEvoluQuery(settingsQuery).data
  const { mode, enabledModes, setMode } = useTerminalHomeMode()

  if (settings === undefined) return <Redirect href="/onboarding" />

  return (
    <SafeAreaView
      style={{ flex: 1, padding: 16, backgroundColor: theme.background.val }}
    >
      {/* With a single mode on there is nothing to switch to (settings/0001). */}
      {enabledModes.length > 1 && (
        <XStack gap="2" mb="3">
          {enabledModes.map((enabledMode) => (
            <XStack key={enabledMode} flex={1}>
              <AppButton
                label={t(modeLabelKeys[enabledMode])}
                variant={enabledMode === mode ? "primary" : "secondary"}
                onPress={() => setMode(enabledMode)}
              />
            </XStack>
          ))}
        </XStack>
      )}
      {mode === "pos" ? null : (
        <AmountKeypad
          currency={getFiatCurrency(settings)}
          tipsEnabled={settings.tipsEnabled === sqliteTrue}
        />
      )}
    </SafeAreaView>
  )
}
