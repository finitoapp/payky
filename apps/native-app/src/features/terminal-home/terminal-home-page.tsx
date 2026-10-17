import { settingsQuery } from "@payky/core/modules/app-settings/app-settings-queries"
import { getFiatCurrency } from "@payky/core/modules/app-settings/app-settings-utils"
import { Redirect } from "expo-router"
import { SafeAreaView } from "react-native-safe-area-context"
import { useTheme } from "tamagui"
import { useEvoluQuery } from "../../hooks/use-evolu-query.ts"
import { AmountKeypad } from "./amount-keypad.tsx"

/**
 * The root screen, like web's `_terminal/` index: an account without its
 * appSettings row is not onboarded and goes to onboarding (a restore runs
 * its own sync screen first, so no initial-sync wait is needed here).
 */
export function TerminalHomePage() {
  const theme = useTheme()
  const [settings] = useEvoluQuery(settingsQuery).data

  if (settings === undefined) return <Redirect href="/onboarding" />

  // Numpad only: the device's remembered home mode and the tables grid
  // arrive with P04.
  return (
    <SafeAreaView
      style={{ flex: 1, padding: 16, backgroundColor: theme.background.val }}
    >
      <AmountKeypad currency={getFiatCurrency(settings)} />
    </SafeAreaView>
  )
}
