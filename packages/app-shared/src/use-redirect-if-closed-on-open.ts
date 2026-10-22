import { useEffect, useState } from "react"

/** Whether what the screen arrived at was already closed on arrival. */
export interface OpenDecision {
  readonly arrival: string
  readonly closedOnOpen: boolean
}

/**
 * Keeps the decision while the screen stays on the same `arrival` and
 * decides again, from the current `closed`, on another one.
 */
export const decideClosedOnOpen = (
  decision: OpenDecision,
  arrival: string,
  closed: boolean
): OpenDecision =>
  decision.arrival === arrival ? decision : { arrival, closedOnOpen: closed }

/**
 * The payment and bill screens serve only an open payment or bill
 * (access/0002): opened on one that is already closed — a typed URL, Back —
 * they hand it to the activity screen, which needs `activity`, so `sell`
 * alone cannot read the history by id. Decided once per arrival, so a payment
 * that gets paid while its screen is open still shows its success.
 *
 * `arrival` names the arrival: the payment or bill id, so a screen reused for
 * another one decides again. Web mounts the page anew on every navigation,
 * so the id is enough there; native's stack keeps the screen mounted and a
 * link or Back returns to it, so native adds the screen's visit
 * (`useScreenVisit`) to the id.
 */
export function useRedirectIfClosedOnOpen(
  arrival: string,
  closed: boolean,
  redirect: () => void
): boolean {
  const [decision, setDecision] = useState<OpenDecision>(() => ({
    arrival,
    closedOnOpen: closed,
  }))
  const current = decideClosedOnOpen(decision, arrival, closed)
  // Adjusting state while rendering, as React documents for a changed prop.
  if (current !== decision) setDecision(current)

  // biome-ignore lint/correctness/useExhaustiveDependencies: once per decision
  useEffect(() => {
    if (current.closedOnOpen) redirect()
  }, [current])

  return current.closedOnOpen
}
