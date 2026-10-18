import type { LucideIcon } from "lucide-react-native"
import CircleCheck from "lucide-react-native/icons/circle-check"
import Info from "lucide-react-native/icons/info"
import OctagonX from "lucide-react-native/icons/octagon-x"
import TriangleAlert from "lucide-react-native/icons/triangle-alert"
import { styled, Text, View } from "tamagui"
import { radius } from "../../theme/tokens.ts"
import { Icon } from "./icon.tsx"

/**
 * The look of one toast from web `apps/web-app/src/components/ui/sonner.tsx`:
 * sonner's toast on `--normal-bg: popover`, `--normal-text:
 * popover-foreground`, `--normal-border: border`, `--border-radius:
 * radius` (8.8), 16 px padding, 13 px text and a 16 px icon per type
 * (`CircleCheck`, `OctagonX`, `Info`, `TriangleAlert`). The queue and the
 * timing stay in `components/app/toast-host.tsx`. Sonner's shadow is left
 * out; the border separates the toast from the screen.
 */

type ToastVariant = "success" | "error" | "info" | "warning"

const icons = {
  success: CircleCheck,
  error: OctagonX,
  info: Info,
  warning: TriangleAlert,
} as const satisfies Record<ToastVariant, LucideIcon>

const ToastFrame = styled(View, {
  name: "Toast",
  flexDirection: "row",
  items: "center",
  gap: 6,
  minH: 48,
  p: 16,
  rounded: radius.lg,
  borderWidth: 1,
  borderColor: "border-color",
  bg: "popover",
})

export function Toast({
  variant,
  message,
  onPress,
}: {
  readonly variant: ToastVariant
  /** Already translated. */
  readonly message: string
  readonly onPress?: () => void
}) {
  return (
    <ToastFrame
      onPress={onPress}
      accessibilityRole="alert"
      accessibilityLiveRegion="assertive"
    >
      <Icon icon={icons[variant]} color="popover-foreground" />
      <Text flex={1} fontSize={13} color="popover-foreground">
        {message}
      </Text>
    </ToastFrame>
  )
}
