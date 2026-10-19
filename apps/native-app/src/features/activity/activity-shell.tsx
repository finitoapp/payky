import { router } from "expo-router"
import ChartColumn from "lucide-react-native/icons/chart-column"
import { type ReactNode, Suspense } from "react"
import { SafeAreaView } from "react-native-safe-area-context"
import { useTheme, YStack } from "tamagui"
import { FadeHeader } from "../../components/fade-header.tsx"
import { ListSkeleton } from "../../components/list-skeleton.tsx"
import { Button } from "../../components/ui/button.tsx"
import { Icon } from "../../components/ui/icon.tsx"
import { Tabs, TabsList, TabsTrigger } from "../../components/ui/tabs.tsx"
import { useTranslation } from "../../hooks/use-translation.ts"

type ActivityTab = "payments" | "bills"

/**
 * Header and the payments/bills tabs around a history list, as web's
 * `activity-pages.tsx` and `ActivityTabs`: the stats link is the header's
 * end icon, and each tab is its own route; switching replaces rather than
 * pushes, so back always leaves Activity instead of rewinding through tabs.
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
      style={{
        flex: 1,
        paddingHorizontal: 16,
        backgroundColor: theme.background.val,
      }}
    >
      <FadeHeader
        title={t("activity.title")}
        endAddon={
          <Button
            variant="ghost"
            accessibilityLabel={t("nav.stats")}
            onPress={() => router.push("/stats")}
          >
            <Icon
              icon={ChartColumn}
              size={20}
              color="primary"
              strokeWidth={3}
            />
          </Button>
        }
      />
      <YStack flex={1} gap={32}>
        <Tabs value={active}>
          <TabsList>
            <TabsTrigger
              value="payments"
              onPress={() =>
                active !== "payments" && router.replace("/activity")
              }
            >
              {t("activity.tabs.payments")}
            </TabsTrigger>
            <TabsTrigger
              value="bills"
              onPress={() =>
                active !== "bills" && router.replace("/activity/bills")
              }
            >
              {t("activity.tabs.bills")}
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <Suspense fallback={<ListSkeleton rows={5} />}>{children}</Suspense>
      </YStack>
    </SafeAreaView>
  )
}
