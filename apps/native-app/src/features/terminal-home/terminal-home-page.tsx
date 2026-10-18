import { sqliteTrue } from "@evolu/common"
import { settingsQuery } from "@payky/core/modules/app-settings/app-settings-queries"
import { getFiatCurrency } from "@payky/core/modules/app-settings/app-settings-utils"
import { createRandomBillId } from "@payky/core/modules/bill/bill-types"
import { Redirect, router } from "expo-router"
import { Suspense } from "react"
import { SafeAreaView } from "react-native-safe-area-context"
import { useTheme, XStack } from "tamagui"
import { AppButton } from "../../components/app-button.tsx"
import { LoadingView } from "../../components/state-views.tsx"
import { useEvoluQuery } from "../../hooks/use-evolu-query.ts"
import { useHardwareScanner } from "../../hooks/use-hardware-scanner.ts"
import { useIsConfirmOpen } from "../../hooks/use-is-confirm-open.ts"
import { useTranslation } from "../../hooks/use-translation.ts"
import { AmountKeypad } from "./amount-keypad.tsx"
import { PosOverviewPage } from "./pos-overview-page.tsx"
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
  const confirmOpen = useIsConfirmOpen()
  // A scan in either mode starts a new bill without a table; the bill then
  // adds the item as if it had been scanned there (scanner/0001).
  useHardwareScanner({
    enabled: settings !== undefined && !confirmOpen,
    onScan: (code) =>
      router.push({
        pathname: "/bill",
        params: { billId: createRandomBillId(), scan: code },
      }),
  })

  if (settings === undefined) return <Redirect href="/onboarding" />

  return (
    <SafeAreaView
      style={{ flex: 1, padding: 16, backgroundColor: theme.background.val }}
    >
      {/* With a single mode on there is nothing to switch to (settings/0001). */}
      <XStack gap="2" mb="3">
        {enabledModes.length > 1 &&
          enabledModes.map((enabledMode) => (
            <XStack key={enabledMode} flex={1}>
              <AppButton
                label={t(modeLabelKeys[enabledMode])}
                variant={enabledMode === mode ? "primary" : "secondary"}
                onPress={() => setMode(enabledMode)}
              />
            </XStack>
          ))}
        {/* The ways into the history and the settings, as web's header links. */}
        <XStack flex={enabledModes.length > 1 ? undefined : 1}>
          <AppButton
            label={t("nav.activity")}
            variant="secondary"
            onPress={() => router.push("/activity")}
          />
        </XStack>
        <XStack flex={enabledModes.length > 1 ? undefined : 1}>
          <AppButton
            label={t("nav.settings")}
            variant="secondary"
            onPress={() => router.push("/settings")}
          />
        </XStack>
      </XStack>
      {/* Web reaches these from the Spark and Cashu account settings, which native lacks (owner PIN gate on the routes). */}
      <XStack gap="2" mb="3">
        <XStack flex={1}>
          <AppButton
            label={t("withdraw.history.title")}
            variant="secondary"
            onPress={() => router.push("/withdraw")}
          />
        </XStack>
        <XStack flex={1}>
          <AppButton
            label={t("withdraw.cashu.title")}
            variant="secondary"
            onPress={() => router.push("/cashu-withdraw")}
          />
        </XStack>
      </XStack>
      {mode === "pos" ? (
        <Suspense fallback={<LoadingView />}>
          <PosOverviewPage />
        </Suspense>
      ) : (
        <AmountKeypad
          currency={getFiatCurrency(settings)}
          tipsEnabled={settings.tipsEnabled === sqliteTrue}
        />
      )}
    </SafeAreaView>
  )
}
