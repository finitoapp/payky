import { sqliteTrue } from "@evolu/common"
import {
  findOwnerRelays,
  initialSyncIdleLimitMs,
  isInitialSyncPending,
} from "@payky/core/evolu/initial-sync-state"
import { settingsQuery } from "@payky/core/modules/app-settings/app-settings-queries"
import { getFiatCurrency } from "@payky/core/modules/app-settings/app-settings-utils"
import { createRandomBillId } from "@payky/core/modules/bill/bill-types"
import { Redirect, router } from "expo-router"
import { useAtomValue } from "jotai"
import Calculator from "lucide-react-native/icons/calculator"
import Clock3 from "lucide-react-native/icons/clock-3"
import LayoutGrid from "lucide-react-native/icons/layout-grid"
import Settings from "lucide-react-native/icons/settings"
import { Suspense, useEffect, useState, useSyncExternalStore } from "react"
import { ActivityIndicator } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { useTheme, View, XStack } from "tamagui"
import { accountAtom } from "../../atoms/account.ts"
import { evoluAtom } from "../../atoms/evolu.ts"
import { LoadingView } from "../../components/loading-view.tsx"
import { SlidingPillSegmentContent } from "../../components/sliding-pill.tsx"
import { Button } from "../../components/ui/button.tsx"
import { Icon } from "../../components/ui/icon.tsx"
import {
  ToggleGroup,
  ToggleGroupItem,
} from "../../components/ui/toggle-group.tsx"
import { nativeRun } from "../../core/native-runtime.ts"
import { useEvoluQuery } from "../../hooks/use-evolu-query.ts"
import { useHardwareScanner } from "../../hooks/use-hardware-scanner.ts"
import { useIsConfirmOpen } from "../../hooks/use-is-confirm-open.ts"
import { useScreenWakeLock } from "../../hooks/use-screen-wake-lock.ts"
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
  useScreenWakeLock(true)
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

  if (settings === undefined) return <NotOnboarded />

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
                      pillId="home-mode-pill"
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

/**
 * As web's `NotOnboarded`: a missing appSettings row means nothing while the
 * account's first sync is still transferring (a paired or restored account
 * reopened mid-sync), so this waits for that before sending the account to
 * onboarding, where finishing would overwrite the synced settings. An
 * account that does not sync (no transports, or a demo) never registers its
 * owner, so it goes straight on; one that does gets
 * `initialSyncIdleLimitMs` for the owner to be reported.
 */
function NotOnboarded() {
  const { t } = useTranslation()
  const theme = useTheme()
  const account = useAtomValue(accountAtom)
  const evolu = useAtomValue(evoluAtom)
  const { syncState } = nativeRun.deps
  const state = useSyncExternalStore(syncState.subscribe, syncState.get)
  const relays = findOwnerRelays(state, evolu.name, evolu.appOwner.id)
  const syncs = account.demo === null && account.transports.length > 0
  const ownerUnknown = syncs && relays === null
  const [ownerTimedOut, setOwnerTimedOut] = useState(false)
  useEffect(() => {
    if (!ownerUnknown) return
    const id = setTimeout(() => setOwnerTimedOut(true), initialSyncIdleLimitMs)
    return () => clearTimeout(id)
  }, [ownerUnknown])
  const waitingForSync =
    syncs && (relays === null ? !ownerTimedOut : isInitialSyncPending(relays))

  if (!waitingForSync) return <Redirect href="/onboarding" />
  return (
    <View flex={1} items="center" justify="center" bg="background">
      <ActivityIndicator
        size="large"
        color={theme["muted-foreground"]?.val}
        accessibilityLabel={t("accountRestore.syncing")}
      />
    </View>
  )
}
