import { useState } from "react"

/**
 * The save half of a control that commits the moment it is touched (an option
 * list, a switch), as web's `useInlineChoice`: the picked value stays on screen
 * until `onSave` settles so the control never flashes the stored one back while
 * Evolu catches up, and a second pick during the save is ignored. `onSave`
 * resolves `true` once stored (a `useRunToast` result).
 */
export function useInlineChoice<T>(
  defaultValue: T,
  onSave: (value: T) => Promise<boolean>
) {
  // Boxed, because `null` and `false` are values a control can be saving.
  const [inFlight, setInFlight] = useState<readonly [T] | null>(null)

  const choose = async (next: T) => {
    if (next === defaultValue || inFlight !== null) return
    setInFlight([next])
    await onSave(next)
    setInFlight(null)
  }

  return {
    value: inFlight === null ? defaultValue : inFlight[0],
    saving: inFlight !== null,
    choose,
  }
}
