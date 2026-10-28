import { type ReactNode, useEffect, useState } from "react"
import { Animated, Easing, StyleSheet } from "react-native"
import { useTheme, View } from "tamagui"
import { isReduceMotionEnabled } from "../platform/reduce-motion.ts"
import type { ThemeColor } from "../theme/themes.ts"

/**
 * Web's looping status animations, on RN `Animated` with the native driver
 * like the effects in `components/motion.ts`, stopped on unmount and never
 * started under reduced motion, as web's `motion-reduce:animate-none`:
 *
 * - `ping`, Tailwind's `animate-ping`: a ring behind the dot scales to 2×
 *   and fades out over the first 75 % of each second (`cubic-bezier(0, 0,
 *   0.2, 1)`), then waits out the rest.
 * - `pulse`, Tailwind's `animate-pulse`: opacity 1 → 0.5 → 1 over 2 s
 *   (`cubic-bezier(0.4, 0, 0.6, 1)` each way), as `ui/skeleton.tsx` does.
 */
export type StatusLoop = "ping" | "pulse"

const ping = {
  inputRange: [0, 1],
  scale: [1, 2],
  /** Web's ring is `opacity-60`, which the keyframes fade to 0. */
  opacity: [0.6, 0],
}

const startLoop = (loop: StatusLoop, value: Animated.Value) => {
  const animation =
    loop === "ping"
      ? Animated.loop(
          Animated.sequence([
            Animated.timing(value, {
              toValue: 1,
              duration: 750,
              easing: Easing.bezier(0, 0, 0.2, 1),
              useNativeDriver: true,
            }),
            Animated.delay(250),
          ])
        )
      : Animated.loop(
          Animated.sequence(
            [0.5, 1].map((toValue) =>
              Animated.timing(value, {
                toValue,
                duration: 1000,
                easing: Easing.bezier(0.4, 0, 0.6, 1),
                useNativeDriver: true,
              })
            )
          )
        )
  animation.start()
  return animation
}

/**
 * Runs `loop` on a value that rests at `rest` (0 for ping's progress, 1 for
 * pulse's opacity); `undefined` holds it at rest.
 */
function useStatusLoop(loop: StatusLoop | undefined) {
  const rest = loop === "pulse" ? 1 : 0
  const [value] = useState(() => new Animated.Value(rest))
  useEffect(() => {
    value.setValue(rest)
    if (loop === undefined || isReduceMotionEnabled()) return
    const animation = startLoop(loop, value)
    return () => animation.stop()
  }, [loop, rest, value])
  return value
}

/**
 * The 8 px status dot of web's stats "live" badge (`size-2 rounded-full`
 * with a `animate-ping` ring) and the transport sync status (`animate-pulse`
 * while syncing or connecting). Without `loop` it is a still dot.
 */
export function PulseDot({
  color,
  loop,
}: {
  readonly color: ThemeColor
  readonly loop?: StatusLoop
}) {
  const theme = useTheme()
  const value = useStatusLoop(loop)
  const backgroundColor = theme[color]?.val
  return (
    <View w={8} h={8} shrink={0}>
      {loop === "ping" ? (
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            {
              borderRadius: 4,
              backgroundColor,
              opacity: value.interpolate({
                inputRange: ping.inputRange,
                outputRange: ping.opacity,
              }),
              transform: [
                {
                  scale: value.interpolate({
                    inputRange: ping.inputRange,
                    outputRange: ping.scale,
                  }),
                },
              ],
            },
          ]}
        />
      ) : null}
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          {
            borderRadius: 4,
            backgroundColor,
            opacity: loop === "pulse" ? value : 1,
          },
        ]}
      />
    </View>
  )
}

/**
 * Pulses its children (`animate-pulse`) while mounted, as web's Bolt Card
 * NFC icon while the reader waits for a tap.
 */
export function Pulsing({ children }: { readonly children: ReactNode }) {
  const opacity = useStatusLoop("pulse")
  return <Animated.View style={{ opacity }}>{children}</Animated.View>
}
