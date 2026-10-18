import { useEffect, useState } from "react"
import { Animated } from "react-native"
import { type GetProps, styled, View } from "tamagui"
import { radius } from "../../theme/tokens.ts"

/**
 * Web `apps/web-app/src/components/ui/skeleton.tsx`: `animate-pulse
 * rounded-md bg-muted`. The pulse (opacity 1 → 0.5 and back, 2 s, as
 * Tailwind's) runs on RN `Animated` with the native driver, because the
 * Tamagui config has no animation driver.
 */

const SkeletonFrame = styled(View, {
  name: "Skeleton",
  bg: "muted",
  rounded: radius.md,
})

const AnimatedFrame = Animated.createAnimatedComponent(SkeletonFrame)

export function Skeleton(props: GetProps<typeof SkeletonFrame>) {
  const [opacity] = useState(() => new Animated.Value(1))
  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.5,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    )
    pulse.start()
    return () => pulse.stop()
  }, [opacity])
  return (
    <AnimatedFrame
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ opacity }}
      {...props}
    />
  )
}
