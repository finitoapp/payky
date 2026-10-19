import { router } from "expo-router"
import ArrowLeft from "lucide-react-native/icons/arrow-left"
import { type ReactNode, useEffect, useState } from "react"
import { Animated } from "react-native"
import { Text, View, XStack } from "tamagui"
import { useTranslation } from "../hooks/use-translation.ts"
import { fontSize, fontWeight } from "../theme/tokens.ts"
import { useScreenScroll } from "./screen.tsx"
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
 * Inside a `Screen` it fades out over the first 75 px of scroll and drifts
 * up at 1/2.5 of the scroll speed, as web's fixed bar does: it stays the
 * first child of the scroll content and is shifted down by the rest of the
 * offset. Once faded it stops taking touches, so a tap on the content under
 * it never goes back.
 *
 * Native differences: `px-4` comes from `Screen`'s padding; the title is
 * one line.
 */

const fadeDistance = 75
const driftRatio = 1 / 2.5
export function FadeHeader({
  title,
  subtitle,
  startAddon,
  endAddon,
  customStartAddonOnClick,
}: {
  /** Already translated. */
  readonly title?: string
  /** A muted second line under the title, as web's bill header has. */
  readonly subtitle?: string
  /** Replaces the back button; `null` leaves the slot empty. */
  readonly startAddon?: ReactNode | null
  /** A trailing control, such as a list's "+". */
  readonly endAddon?: ReactNode
  readonly customStartAddonOnClick?: () => void
}) {
  const { t } = useTranslation()
  const scrollY = useScreenScroll()
  const [faded, setFaded] = useState(false)

  useEffect(() => {
    if (scrollY === null) return
    const listener = scrollY.addListener(({ value }) => {
      setFaded(value >= fadeDistance)
    })
    return () => scrollY.removeListener(listener)
  }, [scrollY])

  const bar = (
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
      <View flex={1} items="center">
        <Text
          text="center"
          fontSize={fontSize.xl}
          fontWeight={fontWeight.bold}
          numberOfLines={1}
          accessibilityRole="header"
        >
          {title}
        </Text>
        {subtitle === undefined ? null : (
          <Text
            fontSize={fontSize.sm}
            color="muted-foreground"
            numberOfLines={1}
          >
            {subtitle}
          </Text>
        )}
      </View>
      <View w={40} items="flex-end">
        {endAddon}
      </View>
    </XStack>
  )
  if (scrollY === null) return bar
  return (
    <Animated.View
      pointerEvents={faded ? "none" : "auto"}
      style={{
        zIndex: 10,
        opacity: scrollY.interpolate({
          inputRange: [0, fadeDistance],
          outputRange: [1, 0],
          extrapolate: "clamp",
        }),
        transform: [
          {
            translateY: scrollY.interpolate({
              inputRange: [0, 1],
              outputRange: [0, 1 - driftRatio],
              extrapolateLeft: "clamp",
            }),
          },
        ],
      }}
    >
      {bar}
    </Animated.View>
  )
}
