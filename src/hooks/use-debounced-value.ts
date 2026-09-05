import { useEffect, useState, useTransition } from "react"

/**
 * Returns `value`, updated only after it stays unchanged for `delayMs`.
 * Generic — reusable anywhere a rapidly-changing input (search text, a
 * slider) should not drive an expensive downstream computation or query on
 * every change.
 *
 * Pass `transition: true` when the debounced value drives a Suspense-backed
 * query (for example `useInfiniteEvoluQuery`) whose already-rendered content
 * must stay on screen while new content loads, instead of the nearest
 * `<Suspense>` boundary swapping to its fallback — see `BillCartView`'s cart
 * grid, where that fallback would otherwise unmount the grid mid-tap. A
 * `delayMs` of `0` still defers the value by a tick and wraps it in
 * `startTransition`, decoupling a query-driving value from one that must
 * update immediately (for example a selected filter chip's own highlight)
 * without adding a perceptible delay.
 */
export function useDebouncedValue<T>(
  value: T,
  delayMs: number,
  { transition = false }: { readonly transition?: boolean } = {}
): T {
  const [debounced, setDebounced] = useState(value)
  const [, startTransition] = useTransition()

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (transition) {
        startTransition(() => setDebounced(value))
      } else {
        setDebounced(value)
      }
    }, delayMs)
    return () => clearTimeout(timeoutId)
  }, [value, delayMs, transition])

  return debounced
}
