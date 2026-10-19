import TriangleAlert from "lucide-react-native/icons/triangle-alert"
import type { ReactNode } from "react"
import { View } from "tamagui"
import { Alert, AlertDescription, AlertTitle } from "./ui/alert.tsx"

/**
 * Web `apps/web-app/src/components/collision-alert.tsx`: a collision from
 * docs/bill-payment-states.md — a state two offline devices can merge into
 * that no single device could reach — stated as a warning, with the
 * actions that resolve it below the alert rather than in `AlertAction`:
 * they are full-size decisions, not a compact affordance.
 *
 * Tailwind mirrored: `flex-col gap-3`, the actions `flex-col gap-2` (a
 * phone never reaches web's `sm:flex-row`).
 */
export function CollisionAlert({
  title,
  description,
  children,
}: {
  /** Already translated, as `description`. */
  readonly title: string
  readonly description: string
  /** The actions that resolve the collision. */
  readonly children: ReactNode
}) {
  return (
    <View gap={12}>
      <Alert variant="warning" icon={TriangleAlert}>
        <AlertTitle>{title}</AlertTitle>
        <AlertDescription>{description}</AlertDescription>
      </Alert>
      <View gap={8}>{children}</View>
    </View>
  )
}
