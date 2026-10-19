import { router } from "expo-router"
import ArrowLeft from "lucide-react-native/icons/arrow-left"
import type { ReactNode } from "react"
import { Text, View, XStack } from "tamagui"
import { useTranslation } from "../hooks/use-translation.ts"
import { fontSize, fontWeight } from "../theme/tokens.ts"
import { Button } from "./ui/button.tsx"
import { Icon } from "./ui/icon.tsx"

/** Back to the previous screen, or home when this one was opened cold. */
const goBack = () => (router.canGoBack() ? router.back() : router.replace("/"))

/**
 * Web `apps/web-app/src/components/fade-header.tsx`: a centered title between
 * two 40-wide slots, the start one holding a ghost back button with a bold
 * primary `ArrowLeft` (`size-5`, stroke 3).
 *
 * Tailwind mirrored: `py-3 gap-4`, slots `w-10`, title `flex-1 text-xl
 * font-bold text-center`.
 *
 * Native differences: the bar is static, not fixed and fading with the
 * page scroll (step 3.2 adds that); `px-4` comes from `Screen`'s padding;
 * the title is one line.
 */
export function FadeHeader({
  title,
  startAddon,
  endAddon,
  customStartAddonOnClick,
}: {
  /** Already translated. */
  readonly title?: string
  /** Replaces the back button; `null` leaves the slot empty. */
  readonly startAddon?: ReactNode | null
  /** A trailing control, such as a list's "+". */
  readonly endAddon?: ReactNode
  readonly customStartAddonOnClick?: () => void
}) {
  const { t } = useTranslation()
  return (
    <XStack items="center" gap={16} py={12}>
      <View w={40} items="flex-start">
        {startAddon === undefined ? (
          <Button
            variant="ghost"
            size="icon"
            accessibilityLabel={t("nav.back")}
            onPress={customStartAddonOnClick ?? goBack}
          >
            <Icon icon={ArrowLeft} size={20} color="primary" strokeWidth={3} />
          </Button>
        ) : (
          startAddon
        )}
      </View>
      <Text
        flex={1}
        text="center"
        fontSize={fontSize.xl}
        fontWeight={fontWeight.bold}
        numberOfLines={1}
        accessibilityRole="header"
      >
        {title}
      </Text>
      <View w={40} items="flex-end">
        {endAddon}
      </View>
    </XStack>
  )
}
