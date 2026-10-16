import { motion, useReducedMotion } from "motion/react"
import type { ReactNode } from "react"

/**
 * A segmented control whose active segment carries a pill that slides to
 * the next one, and whose inactive segments show only their icon — the
 * home mode switch and the payment method tabs. The control primitive
 * (ToggleGroup, Tabs) stays the caller's; this supplies the motion parts:
 *
 * - `slidingPillLayout(transition)` as the `render` props of both the group
 *   and every segment, and
 * - `SlidingPillSegmentContent` as each segment's children.
 *
 * Switching is one shared `motion` layout animation: the group and every
 * segment animate to their new natural widths while the pill (`layoutId`)
 * slides between them. Everything has to be in that one layout tree — a
 * pill animating on its own chases a segment that is still resizing under
 * it and overstretches. Icon and label are `layout="position"` so the
 * segments' scale doesn't squash them, and radii are inline because motion
 * only scale-corrects inline ones. Segments must not clip
 * (`overflow-hidden`): the pill lives inside the target segment and would
 * be cut off instead of sliding in. Wrap the group in a `LayoutGroup`.
 *
 * A segment needs `relative isolate` (the pill sits at `-z-10` inside it),
 * a transparent active background, `transition-colors` rather than the
 * vendored `transition-all` (a CSS transform transition fights motion's),
 * and an `aria-label`, since an inactive segment renders no text.
 */
export function useSlidingPillTransition() {
  return useReducedMotion()
    ? { duration: 0 }
    : { type: "spring" as const, bounce: 0, duration: 0.35 }
}

export const slidingPillLayout = (
  transition: ReturnType<typeof useSlidingPillTransition>
) => ({
  layout: true,
  transition,
  style: { borderRadius: 9999 },
})

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
  readonly label: string
}) {
  const transition = useSlidingPillTransition()
  // A label mounts straight into its final spot while its segment is still
  // growing out of the icon-only size, so it waits until the pill has
  // mostly arrived instead of flashing in past the pill's edge.
  const labelTransition =
    "type" in transition
      ? { ...transition, opacity: { delay: 0.2, duration: 0.15 } }
      : transition

  return (
    <>
      {active && (
        <motion.span
          layoutId={pillId}
          transition={transition}
          style={{ borderRadius: 9999 }}
          className="absolute inset-0 -z-10 bg-foreground"
        />
      )}
      <motion.span layout="position" transition={transition} className="flex">
        {icon}
      </motion.span>
      {active && (
        <motion.span
          layout="position"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={labelTransition}
          className="whitespace-nowrap pl-1.5"
        >
          {label}
        </motion.span>
      )}
    </>
  )
}
