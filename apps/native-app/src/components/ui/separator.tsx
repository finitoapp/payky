import { styled, View } from "tamagui"

/**
 * Web `apps/web-app/src/components/ui/separator.tsx`: `shrink-0 bg-border`,
 * `h-px w-full` or (`vertical`) `w-px self-stretch`.
 *
 * A plain `View` rather than Tamagui `Separator`, which is `flex: 1` and
 * would grow to fill a column.
 */
export const Separator = styled(View, {
  name: "Separator",
  shrink: 0,
  bg: "border-color",

  variants: {
    orientation: {
      horizontal: { h: 1, self: "stretch" },
      vertical: { w: 1, self: "stretch" },
    },
  } as const,

  defaultVariants: { orientation: "horizontal" },
})
