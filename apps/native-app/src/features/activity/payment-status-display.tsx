import type { PaymentStatus } from "@payky/core/modules/payment/payment-types"
import type { LucideIcon } from "lucide-react-native"
import Check from "lucide-react-native/icons/check"
import Clock from "lucide-react-native/icons/clock"
import RotateCw from "lucide-react-native/icons/rotate-cw"
import TriangleAlert from "lucide-react-native/icons/triangle-alert"
import X from "lucide-react-native/icons/x"
import { View } from "tamagui"
import { Icon } from "../../components/ui/icon.tsx"
import { radius } from "../../theme/tokens.ts"

type Tone = {
  readonly bg: "destructive-10" | "success-10" | "muted" | "warning-10"
  readonly color: "destructive" | "success" | "muted-foreground" | "warning"
  readonly icon: LucideIcon
}

const statusIcons = {
  canceled: { bg: "destructive-10", color: "destructive", icon: X },
  paid: { bg: "success-10", color: "success", icon: Check },
  expired: { bg: "muted", color: "muted-foreground", icon: Clock },
  pending: { bg: "warning-10", color: "warning", icon: RotateCw },
} as const satisfies Record<PaymentStatus, Tone>

const collisionIcon = {
  bg: "warning-10",
  color: "warning",
  icon: TriangleAlert,
} as const satisfies Tone

/**
 * Web's `PaymentStatusIcon` (`payment-status-display.tsx`): a payment's
 * status as a filled 32 circle; a cancellation collision overrides it with
 * a warning triangle wherever the payment appears.
 */
export function PaymentStatusIcon({
  status,
  hasCancellationCollision,
}: {
  readonly status: PaymentStatus
  readonly hasCancellationCollision: boolean
}) {
  const tone: Tone = hasCancellationCollision
    ? collisionIcon
    : statusIcons[status]
  return (
    <View
      w={32}
      h={32}
      shrink={0}
      rounded={radius.full}
      bg={tone.bg}
      items="center"
      justify="center"
    >
      <Icon icon={tone.icon} color={tone.color} />
    </View>
  )
}
