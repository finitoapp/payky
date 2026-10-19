import type { ReactNode } from "react"
import { Text, View } from "tamagui"
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
 * ponytail: the pill jumps to the new segment instead of sliding (web's
 * `motion` layout animation); the Tamagui config has no animation driver,
 * so add `LayoutAnimation.configureNext` in the caller's change handler if
 * the jump reads badly on the device.
 */
export function SlidingPillSegmentContent({
  active,
  icon,
  label,
}: {
  readonly active: boolean
  readonly icon: ReactNode
  /** Already translated; shown only on the active segment. */
  readonly label: string
}) {
  return (
    <>
      {active ? (
        <View
          position="absolute"
          t={0}
          r={0}
          b={0}
          l={0}
          rounded={radius.full}
          bg="color"
        />
      ) : null}
      <View flexDirection="row" items="center">
        {icon}
        {active ? (
          <Text
            pl={6}
            numberOfLines={1}
            color="background"
            fontSize={fontSize.sm}
            fontWeight={fontWeight.medium}
          >
            {label}
          </Text>
        ) : null}
      </View>
    </>
  )
}
