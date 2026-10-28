import { AccessibilityInfo } from "react-native"

/**
 * The system's reduce-motion setting (Android's "Remove animations"), what
 * web reads as `prefers-reduced-motion`. Kept in a module variable that the
 * system keeps current, so effects and layout effects can read it
 * synchronously; it is `false` until the first answer arrives.
 */
let reduceMotion = false
void AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
  reduceMotion = reduced
})
AccessibilityInfo.addEventListener("reduceMotionChanged", (reduced) => {
  reduceMotion = reduced
})

export const isReduceMotionEnabled = () => reduceMotion
