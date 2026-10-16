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
 * grid, where that fallback would otherwise unmount the grid mid-tap. For a
 * value that isn't otherwise time-debounced but still needs that same
 * "defer into a transition" treatment (for example a filter that changes
 * immediately, like a category tap), prefer React's own `useDeferredValue`
 * instead of this hook with `delayMs: 0` — it does the same thing natively,
 * with no timer.
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
