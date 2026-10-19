import { sqliteTrue } from "@evolu/common"
import { settingsQuery } from "@payky/core/modules/app-settings/app-settings-queries"
import { getFiatCurrency } from "@payky/core/modules/app-settings/app-settings-utils"
import { createRandomBillId } from "@payky/core/modules/bill/bill-types"
import { Redirect, router } from "expo-router"
import Calculator from "lucide-react-native/icons/calculator"
import Clock3 from "lucide-react-native/icons/clock-3"
import LayoutGrid from "lucide-react-native/icons/layout-grid"
import Settings from "lucide-react-native/icons/settings"
import { Suspense } from "react"
import { SafeAreaView } from "react-native-safe-area-context"
import { useTheme, View, XStack } from "tamagui"
import { SlidingPillSegmentContent } from "../../components/sliding-pill.tsx"
import { LoadingView } from "../../components/state-views.tsx"
import { Button } from "../../components/ui/button.tsx"
import { Icon } from "../../components/ui/icon.tsx"
import {
  ToggleGroup,
  ToggleGroupItem,
} from "../../components/ui/toggle-group.tsx"
import { useEvoluQuery } from "../../hooks/use-evolu-query.ts"
import { useHardwareScanner } from "../../hooks/use-hardware-scanner.ts"
import { useIsConfirmOpen } from "../../hooks/use-is-confirm-open.ts"
import { useTranslation } from "../../hooks/use-translation.ts"
import { radius } from "../../theme/tokens.ts"
import { AmountKeypad } from "./amount-keypad.tsx"
import { PosOverviewPage } from "./pos-overview-page.tsx"
import { useTerminalHomeMode } from "./use-terminal-home-mode.ts"

const homeModeItems = [
  { mode: "numpad", icon: Calculator, label: "nav.numpad" },
  { mode: "pos", icon: LayoutGrid, label: "nav.pos" },
] as const

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
      <XStack items="center" justify="space-between" mb={12}>
        {/*
         * Both modes stay on screen so the control reads as a switch; only
         * the active one spells out its label. With a single mode on there is
         * nothing to switch to (settings/0001), so the control goes away.
         */}
        {enabledModes.length > 1 ? (
          <View rounded={radius.full} borderWidth={1} borderColor="input" p={4}>
            <ToggleGroup
              value={mode}
              onValueChange={setMode}
              size="lg"
              spacing={0.5}
            >
              {homeModeItems.map(({ mode: itemMode, icon, label }) => {
                const active = itemMode === mode
                return (
                  <ToggleGroupItem
                    key={itemMode}
                    value={itemMode}
                    accessibilityLabel={t(label)}
                    px={16}
                    rounded={radius.full}
                    bg="transparent"
                  >
                    <SlidingPillSegmentContent
                      active={active}
                      icon={
                        <Icon
                          icon={icon}
                          strokeWidth={2.5}
                          color={active ? "background" : "muted-foreground"}
                        />
                      }
                      label={t(label)}
                    />
                  </ToggleGroupItem>
                )
              })}
            </ToggleGroup>
          </View>
        ) : null}
        {/* The ways into the history and the settings, as web's header links. */}
        <XStack ml="auto" items="center" gap={16}>
          <Button
            variant="ghost"
            accessibilityLabel={t("nav.activity")}
            onPress={() => router.push("/activity")}
          >
            <Icon icon={Clock3} size={24} strokeWidth={3} />
          </Button>
          <Button
            variant="ghost"
            accessibilityLabel={t("nav.settings")}
            onPress={() => router.push("/settings")}
          >
            <Icon icon={Settings} size={24} strokeWidth={3} />
          </Button>
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
