import { atom } from "jotai"
import type { ReactNode } from "react"

export interface ConfirmDialogRequest {
  readonly title: ReactNode
  readonly description: ReactNode
  readonly confirmLabel: ReactNode
  readonly cancelLabel: ReactNode
  readonly variant?: "default" | "destructive"
  readonly resolve: (confirmed: boolean) => void
}

/**
 * FIFO queue of pending confirmations. Only `useConfirmDialog` (enqueue) and
 * `ConfirmDialogHost` (render + dequeue + settle `resolve`) should touch this
 * atom directly — anything else reading or writing it can settle a request's
 * Promise without also removing it from the queue, or vice versa.
 */
export const confirmDialogQueueAtom = atom<ReadonlyArray<ConfirmDialogRequest>>(
  []
)
