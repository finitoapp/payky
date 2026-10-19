import { type ComponentRef, type ReactNode, useRef, useState } from "react"
import {
  AccessibilityInfo,
  Animated,
  Easing,
  View as NativeView,
} from "react-native"
import { Text, useTheme, View } from "tamagui"
import { fontSize, fontWeight, radius } from "../theme/tokens.ts"

/**
 * Web `apps/web-app/src/components/sliding-pill.tsx`: the content of one
 * segment of a control whose active segment carries a foreground pill and a
 * label, while inactive segments show only their icon — the home mode
 * switch and the payment method tabs. The control primitive (ToggleGroup,
 * Tabs) stays the caller's, as on web; the caller colors the icon
 * (`background` when active, `muted-foreground` otherwise, as web's
 * `aria-pressed:text-background`).
 *
 * Tailwind mirrored: the pill `absolute inset-0 rounded-full bg-foreground`
 * behind the content, the label `whitespace-nowrap pl-1.5` in
 * `text-background`.
 *
 * Motion, as web's: switching slides the pill from the segment that had it
 * to the new one (web's spring, bounce 0, 0.35 s, as an ease-out), and the
 * label fades in once the pill has mostly arrived (0.2 s delay, 0.15 s).
 * All of it runs on the native driver (the pill moves by translateX and
 * stretches by scaleX), so a busy JS thread does not make it stutter; while
 * it slides, its round ends stretch with the scale, where web's motion
 * corrects the radius.
 * Segments sharing a `pillId` are what the pill slides between: the new
 * active segment starts its pill at the window rect the previous one was
 * last drawn at. Reduced motion switches at once. Segments must not clip,
 * or the arriving pill is cut off.
 *
 * ponytail: the segments themselves jump to their new widths (web animates
 * them in the same layout pass); a `LayoutAnimation.configureNext` in the
 * callers' change handlers would add that.
 */

interface PillRect {
  readonly x: number
  readonly width: number
}

/** Where each control's pill was last drawn, in window coordinates. */
const pillRects = new Map<string, PillRect>()

const slide = { duration: 350, easing: Easing.out(Easing.cubic) }

export function SlidingPillSegmentContent({
  active,
  pillId,
  icon,
  label,
}: {
  readonly active: boolean
  /** Unique per control: segments sharing it are what the pill slides between. */
  readonly pillId: string
  readonly icon: ReactNode
  /** Already translated; shown only on the active segment. */
  readonly label: string
}) {
  const theme = useTheme()
  const pillRef = useRef<ComponentRef<typeof NativeView>>(null)
  const [translateX] = useState(() => new Animated.Value(0))
  const [scaleX] = useState(() => new Animated.Value(1))
  const [labelOpacity] = useState(() => new Animated.Value(1))
  // Set when this segment has just become the active one, so its pill waits
  // hidden for its own rect and slides in from the previous one.
  const [arriving, setArriving] = useState(false)
  const [wasActive, setWasActive] = useState(active)
  if (active !== wasActive) {
    setWasActive(active)
    setArriving(active)
  }

  const onPillLayout = () => {
    pillRef.current?.measureInWindow((x, _y, width) => {
      const from = pillRects.get(pillId)
      pillRects.set(pillId, { x, width })
      if (!arriving) return
      void AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
        setArriving(false)
        if (reduced || from === undefined || width === 0) {
          translateX.setValue(0)
          scaleX.setValue(1)
          labelOpacity.setValue(1)
          return
        }
        // Centre to centre, width as a scale: transforms run on the native
        // thread, so the slide stays smooth while JS renders the new tab.
        translateX.setValue(from.x + from.width / 2 - (x + width / 2))
        scaleX.setValue(from.width / width)
        labelOpacity.setValue(0)
        Animated.parallel([
          Animated.timing(translateX, {
            toValue: 0,
            ...slide,
            useNativeDriver: true,
          }),
          Animated.timing(scaleX, {
            toValue: 1,
            ...slide,
            useNativeDriver: true,
          }),
          Animated.timing(labelOpacity, {
            toValue: 1,
            delay: 200,
            duration: 150,
            useNativeDriver: true,
          }),
        ]).start()
      })
    })
  }

  return (
    <>
      {active ? (
        <>
          {/* Measures the segment's resting pill rect; draws nothing. */}
          <NativeView
            ref={pillRef}
            onLayout={onPillLayout}
            pointerEvents="none"
            style={{
              position: "absolute",
              top: 0,
              right: 0,
              bottom: 0,
              left: 0,
            }}
          />
          <Animated.View
            pointerEvents="none"
            style={{
              position: "absolute",
              top: 0,
              right: 0,
              bottom: 0,
              left: 0,
              transform: [{ translateX }, { scaleX }],
              borderRadius: radius.full,
              backgroundColor: theme.color?.val,
              opacity: arriving ? 0 : 1,
            }}
          />
        </>
      ) : null}
      <View flexDirection="row" items="center">
        {icon}
        {active ? (
          <Animated.View style={{ opacity: arriving ? 0 : labelOpacity }}>
            <Text
              pl={6}
              numberOfLines={1}
              color="background"
              fontSize={fontSize.sm}
              fontWeight={fontWeight.medium}
            >
              {label}
            </Text>
          </Animated.View>
        ) : null}
      </View>
    </>
  )
}
