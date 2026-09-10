import { AlertTriangleIcon } from "lucide-react"
import type { ReactNode } from "react"
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/reui/alert.tsx"

/**
 * A collision from docs/bill-payment-states.md — a state two offline devices
 * can merge into that no single device could reach — stated as a warning,
 * with the actions that resolve it below.
 *
 * Actions go under the alert rather than in `AlertAction`, which moves them
 * into a right-hand column on `sm` and up: these are two full-size decisions
 * ("mark it paid" / "refund"), not the compact affordance that slot is
 * shaped for. `bill-page.tsx`'s `BillCancellationCollisionMessage` lays out
 * the same alert-then-actions order by hand, around the extra bill total and
 * payment links its full-screen variant shows.
 */
export function CollisionAlert({
  title,
  description,
  children,
}: {
  readonly title: string
  readonly description: string
  /** The actions that resolve the collision. */
  readonly children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-3">
      <Alert variant="warning">
        <AlertTriangleIcon />
        <AlertTitle>{title}</AlertTitle>
        <AlertDescription>{description}</AlertDescription>
      </Alert>
      <div className="flex flex-col gap-2 sm:flex-row">{children}</div>
    </div>
  )
}
