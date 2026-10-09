import { useEffect, useState } from "react"

/**
 * The payment and bill screens serve only an open payment or bill
 * (access/0002): opened on one that is already closed — a typed URL, Back —
 * they hand it to the activity screen, which needs `activity`, so `sell`
 * alone cannot read the history by id. Decided once, on the first render, so
 * a payment that gets paid while its screen is open still shows its success.
 */
export function useRedirectIfClosedOnOpen(
  closed: boolean,
  redirect: () => void
): boolean {
  const [closedOnOpen] = useState(closed)

  // biome-ignore lint/correctness/useExhaustiveDependencies: once, on open
  useEffect(() => {
    if (closedOnOpen) redirect()
  }, [closedOnOpen])

  return closedOnOpen
}
