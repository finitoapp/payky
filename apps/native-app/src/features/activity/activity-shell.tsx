import { router } from "expo-router"
import { type ReactNode, Suspense } from "react"
import { SafeAreaView } from "react-native-safe-area-context"
import { useTheme, XStack } from "tamagui"
import { FadeHeader } from "../../components/fade-header.tsx"
import { LoadingView } from "../../components/state-views.tsx"
import { Button } from "../../components/ui/button.tsx"
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
      <FadeHeader title={t("activity.title")} />
      <Button
        size="lg"
        label={t("stats.title")}
        variant="outline"
        onPress={() => router.push("/stats")}
      />
      <XStack gap="2" mb="2">
        <XStack flex={1}>
          <Button
            size="lg"
            label={t("activity.tabs.payments")}
            variant={active === "payments" ? "default" : "outline"}
            onPress={() => active !== "payments" && router.replace("/activity")}
          />
        </XStack>
        <XStack flex={1}>
          <Button
            size="lg"
            label={t("activity.tabs.bills")}
            variant={active === "bills" ? "default" : "outline"}
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
