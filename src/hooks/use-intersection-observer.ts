import { useCallback, useRef } from "react"

/**
 * Returns a ref callback that calls `onIntersect` whenever the element it is
 * attached to scrolls into view (via `IntersectionObserver`) — for example a
 * sentinel element at the end of a list, to trigger loading the next page.
 * Generic — not tied to any one list; any component wanting a "load more on
 * scroll" trigger can reuse it.
 */
export function useIntersectionObserver<T extends Element>(
  onIntersect: () => void,
  {
    enabled = true,
    rootMargin = "200px",
  }: { readonly enabled?: boolean; readonly rootMargin?: string } = {}
): (node: T | null) => void {
  const onIntersectRef = useRef(onIntersect)
  onIntersectRef.current = onIntersect

  return useCallback(
    (node: T | null) => {
      if (node === null || !enabled) return

      const observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) {
            onIntersectRef.current()
          }
        },
        { rootMargin }
      )
      observer.observe(node)
      return () => observer.disconnect()
    },
    [enabled, rootMargin]
  )
}
