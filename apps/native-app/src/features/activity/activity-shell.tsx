import { router } from "expo-router"
import ChartColumn from "lucide-react-native/icons/chart-column"
import {
  createContext,
  type ReactElement,
  type ReactNode,
  Suspense,
  useContext,
  useState,
} from "react"
import { Animated } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { useTheme, YStack } from "tamagui"
import { FadeHeader } from "../../components/fade-header.tsx"
import { ListSkeleton } from "../../components/list-skeleton.tsx"
import {
  ScreenScrollContext,
  screenPadding,
  screenPaddingX,
} from "../../components/screen.tsx"
import { Button } from "../../components/ui/button.tsx"
import { Icon } from "../../components/ui/icon.tsx"
import { Tabs, TabsList, TabsTrigger } from "../../components/ui/tabs.tsx"
import { useTranslation } from "../../hooks/use-translation.ts"

type ActivityTab = "payments" | "bills"

const ActivityHeaderContext = createContext<ReactElement | null>(null)

/** The header and tabs `ActivityList` draws at the top of its scroll. */
export const useActivityHeader = () => useContext(ActivityHeaderContext)

/**
 * Header and the payments/bills tabs around a history list, as web's
 * `activity-pages.tsx` and `ActivityTabs`: the stats link is the header's
 * end icon, and each tab is its own route; switching replaces rather than
 * pushes, so back always leaves Activity instead of rewinding through tabs.
 *
 * As on web, the header and tabs scroll away with the list: `ActivityList`
 * draws them (`useActivityHeader`) at the top of its own scroll and reports
 * that scroll to `FadeHeader` through `ScreenScrollContext`.
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

  const [scrollY] = useState(() => new Animated.Value(0))

  const header = (
    <YStack pb={16}>
      <FadeHeader
        title={t("activity.title")}
        endAddon={
          <Button
            variant="ghost"
            aria-label={t("nav.stats")}
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
      <Tabs value={active}>
        <TabsList>
          <TabsTrigger
            value="payments"
            onPress={() => active !== "payments" && router.replace("/activity")}
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
    </YStack>
  )

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background.val }}>
      <ScreenScrollContext value={scrollY}>
        <ActivityHeaderContext value={header}>
          <Suspense
            fallback={
              <YStack py={screenPadding} px={screenPaddingX} gap={16}>
                {header}
                <ListSkeleton rows={5} />
              </YStack>
            }
          >
            {children}
          </Suspense>
        </ActivityHeaderContext>
      </ScreenScrollContext>
    </SafeAreaView>
  )
}
