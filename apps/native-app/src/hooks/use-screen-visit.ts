import { useFocusEffect } from "expo-router"
import { useCallback, useRef, useState } from "react"

/**
 * Counts the times this screen came back into focus after its first: 0 on
 * mount, then one more each time the stack returns to it — Back, or a link
 * that pops to the screen still mounted (expo-router links pop to the last
 * screen of the route instead of pushing another). Web mounts the page anew
 * on each of those arrivals; this is the native stand-in for that.
 */
export function useScreenVisit(): number {
  const [visit, setVisit] = useState(0)
  const focusedBefore = useRef(false)
  useFocusEffect(
    useCallback(() => {
      if (focusedBefore.current) setVisit((current) => current + 1)
      focusedBefore.current = true
    }, [])
  )
  return visit
}
