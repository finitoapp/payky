import { useAtom } from "jotai"
import { useEffect, useState } from "react"
import {
  type ConfirmDialogRequest,
  confirmDialogQueueAtom,
} from "@/atoms/confirm-dialog.ts"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog.tsx"

const variantClassName = {
  default: undefined,
  destructive:
    "bg-destructive text-destructive-foreground hover:bg-destructive/90",
} satisfies Record<
  NonNullable<ConfirmDialogRequest["variant"]>,
  string | undefined
>

/**
 * Renders the single, app-wide confirmation dialog driven by
 * `confirmDialogQueueAtom`. Confirm/Cancel both settle the head request's
 * Promise and dequeue it; if another request is already queued behind it, the
 * dialog stays open and its content swaps immediately (no close/reopen
 * animation between queued confirmations). `displayed` keeps rendering the
 * dequeued request's title/description/labels through the exit transition
 * (`onOpenChangeComplete` fires only once that finishes), so the popup never
 * shows blank content while it fades/scales out.
 */
export function ConfirmDialogHost() {
  const [queue, setQueue] = useAtom(confirmDialogQueueAtom)
  const current = queue[0] ?? null
  const [displayed, setDisplayed] = useState(current)

  useEffect(() => {
    if (current !== null) setDisplayed(current)
  }, [current])

  const close = (confirmed: boolean) => {
    if (current === null) return
    current.resolve(confirmed)
    // Guard the dequeue by identity, not just by resolving: `onOpenChange`
    // fires a redundant `close(false)` right after an explicit confirm/cancel
    // click (see below), and within the same React batch a second
    // `remaining.slice(1)` would see the *already-sliced* queue and drop the
    // next request too. Only slice when `current` is still the head.
    setQueue((remaining) =>
      remaining[0] === current ? remaining.slice(1) : remaining
    )
  }

  return (
    <AlertDialog
      open={current !== null}
      onOpenChange={(open) => {
        // Cancel/Action are Base UI `Close` primitives, so this also fires
        // (redundantly) right after an explicit confirm/cancel click below —
        // `close`'s `resolve` call is a no-op the second time since a Promise
        // only ever settles once. Escape and the alert-dialog's own disabled
        // outside-press dismissal both route through here too, so every path
        // that can flip `open` to `false` resolves the request exactly once.
        if (!open) close(false)
      }}
      onOpenChangeComplete={(open) => {
        if (!open) setDisplayed(null)
      }}
    >
      <AlertDialogContent>
        {displayed && (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>{displayed.title}</AlertDialogTitle>
              <AlertDialogDescription>
                {displayed.description}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => close(false)}>
                {displayed.cancelLabel}
              </AlertDialogCancel>
              <AlertDialogAction
                className={variantClassName[displayed.variant ?? "default"]}
                onClick={() => close(true)}
              >
                {displayed.confirmLabel}
              </AlertDialogAction>
            </AlertDialogFooter>
          </>
        )}
      </AlertDialogContent>
    </AlertDialog>
  )
}
