import { useLayoutEffect, useRef, useState } from "react"
import { Animated } from "react-native"
import {
  changePulseKeyframes,
  changePulseStyle,
  replay,
} from "../components/motion.ts"
import { isReduceMotionEnabled } from "../platform/reduce-motion.ts"

/**
 * Web `apps/web-app/src/features/bill/use-change-pulse.ts`: pulses (an
 * opacity dip and a scale bounce, the keypad amount's) whenever `value`
 * changes. Returns the animated style for an `Animated.View` around the
 * value; put it on a wrapper, so text that fits itself measures unscaled.
 *
 * Starts settled and skips the first render, so values rendered in bulk (a
 * grid of item quantities) do not all flash on first paint. A layout
 * effect, so the new value is never painted at full size before the pulse.
 * Stays still under reduced motion.
 */
export function useChangePulse(value: string | number) {
  const [progress] = useState(() => new Animated.Value(1))
  const [style] = useState(() => changePulseStyle(progress))
  const lastValue = useRef(value)

  useLayoutEffect(() => {
    if (lastValue.current === value) return
    lastValue.current = value
    if (!isReduceMotionEnabled()) {
      replay(progress, changePulseKeyframes.duration)
    }
  }, [progress, value])

  return style
}
