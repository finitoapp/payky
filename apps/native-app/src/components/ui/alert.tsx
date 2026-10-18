import type { LucideIcon } from "lucide-react-native"
import { Children, type ReactNode } from "react"
import { createStyledContext, styled, Text, View } from "tamagui"
import type { ThemeColor } from "../../theme/themes.ts"
import { fontSize, fontWeight, radius } from "../../theme/tokens.ts"
import { Icon } from "./icon.tsx"

/**
 * Web `apps/web-app/src/components/reui/alert.tsx`: `Alert` with the same
 * variants, `AlertTitle`, `AlertDescription` and `AlertAction`.
 *
 * Tailwind mirrored: `rounded-lg border px-3 py-2.5 text-sm gap-y-0.5`,
 * `gap-x-2.5` beside the `size-4` icon; `default` `bg-card
 * text-card-foreground`; `destructive`/`info`/`success`/`warning`
 * `border-<v>/30 bg-<v>/4` with the icon in `<v>`; `invert` `bg-invert
 * text-invert-foreground`, description `text-invert-foreground/70`. The title
 * is `font-medium line-clamp-1`, the description `text-muted-foreground
 * gap-1`, and the action on a phone (`max-sm:`) sits under the text, `mt-2
 * gap-1.5`.
 *
 * Native differences: web's first `<svg>` child becomes the `icon` prop,
 * since there is no `has-[>svg]` selector; the icon is always top-aligned
 * beside the text.
 */

type AlertVariant =
  | "default"
  | "destructive"
  | "info"
  | "success"
  | "warning"
  | "invert"

const AlertContext = createStyledContext<{ variant: AlertVariant }>({
  variant: "default",
})

const AlertFrame = styled(View, {
  name: "Alert",
  context: AlertContext,
  role: "alert",
  flexDirection: "row",
  items: "flex-start",
  gap: 10,
  w: "100%",
  rounded: radius.lg,
  borderWidth: 1,
  px: 12,
  py: 10,

  variants: {
    variant: {
      default: { bg: "card", borderColor: "border-color" },
      destructive: { bg: "destructive-4", borderColor: "destructive-30" },
      info: { bg: "info-4", borderColor: "info-30" },
      success: { bg: "success-4", borderColor: "success-30" },
      warning: { bg: "warning-4", borderColor: "warning-30" },
      invert: { bg: "invert", borderColor: "invert" },
    },
  } as const,

  defaultVariants: { variant: "default" },
})

const iconColors = {
  default: "card-foreground",
  destructive: "destructive",
  info: "info",
  success: "success",
  warning: "warning",
  invert: "invert-foreground",
} as const satisfies Record<AlertVariant, ThemeColor>

export function Alert({
  variant = "default",
  icon,
  children,
}: {
  readonly variant?: AlertVariant
  readonly icon?: LucideIcon
  readonly children?: ReactNode
}) {
  return (
    <AlertFrame variant={variant} accessibilityRole="alert">
      {icon === undefined ? null : (
        <View pt={2}>
          <Icon icon={icon} color={iconColors[variant]} />
        </View>
      )}
      <View flex={1} gap={2}>
        {children}
      </View>
    </AlertFrame>
  )
}

export const AlertTitle = styled(Text, {
  name: "AlertTitle",
  context: AlertContext,
  numberOfLines: 1,
  fontSize: fontSize.sm,
  fontWeight: fontWeight.medium,

  variants: {
    variant: {
      default: { color: "card-foreground" },
      destructive: { color: "color" },
      info: { color: "color" },
      success: { color: "color" },
      warning: { color: "color" },
      invert: { color: "invert-foreground" },
    },
  } as const,
})

const AlertDescriptionText = styled(Text, {
  name: "AlertDescription",
  context: AlertContext,
  fontSize: fontSize.sm,

  variants: {
    variant: {
      default: { color: "muted-foreground" },
      destructive: { color: "muted-foreground" },
      info: { color: "muted-foreground" },
      success: { color: "muted-foreground" },
      warning: { color: "muted-foreground" },
      invert: { color: "invert-foreground-70" },
    },
  } as const,
})

/** Each string child is one paragraph; other children render as they are. */
export function AlertDescription({
  children,
}: {
  readonly children?: ReactNode
}) {
  return (
    <View gap={4} items="flex-start">
      {Children.map(children, (child) =>
        typeof child === "string" ? (
          <AlertDescriptionText>{child}</AlertDescriptionText>
        ) : (
          child
        )
      )}
    </View>
  )
}

export const AlertAction = styled(View, {
  name: "AlertAction",
  flexDirection: "row",
  flexWrap: "wrap",
  gap: 6,
  mt: 8,
})
