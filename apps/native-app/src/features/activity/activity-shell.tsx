import { router } from "expo-router"
import { type ReactNode, Suspense } from "react"
import { SafeAreaView } from "react-native-safe-area-context"
import { useTheme, XStack } from "tamagui"
import { AppButton } from "../../components/app-button.tsx"
import { ScreenHeader } from "../../components/screen-header.tsx"
import { LoadingView } from "../../components/state-views.tsx"
import { useTranslation } from "../../hooks/use-translation.ts"

type ActivityTab = "payments" | "bills"

/**
 * Header and the payments/bills tabs around a history list. Each tab is its
 * own route, and switching replaces rather than pushes, so back always leaves
 * Activity instead of rewinding through tabs (as web's `ActivityTabs`).
 */
export function ActivityShell({
  active,
  children,
}: {
  readonly active: ActivityTab
  readonly children: ReactNode
}) {
  const theme = useTheme()
  const { t } = useTranslation()

  return (
    <SafeAreaView
      style={{ flex: 1, padding: 16, backgroundColor: theme.background.val }}
    >
      <ScreenHeader title={t("activity.title")} />
      {/* Stats link: arrives with the stats screen (A08). */}
      <XStack gap="2" mb="2">
        <XStack flex={1}>
          <AppButton
            label={t("activity.tabs.payments")}
            variant={active === "payments" ? "primary" : "secondary"}
            onPress={() => active !== "payments" && router.replace("/activity")}
          />
        </XStack>
        <XStack flex={1}>
          <AppButton
            label={t("activity.tabs.bills")}
            variant={active === "bills" ? "primary" : "secondary"}
            onPress={() =>
              active !== "bills" && router.replace("/activity/bills")
            }
          />
        </XStack>
      </XStack>
      <Suspense fallback={<LoadingView />}>{children}</Suspense>
    </SafeAreaView>
  )
}
