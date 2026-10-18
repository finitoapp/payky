import { emptyScanBuffer, readScanKey } from "@payky/app-shared/hardware-scan"
import { useEffect, useEffectEvent } from "react"

/**
 * Reports codes from a keyboard-wedge barcode scanner while `enabled`. See
 * docs/decisions/scanner/0001 for why it works this way and its limits.
 *
 * Listens on `window` in the capture phase — which is why it is not
 * `@dedalik/use-react`'s `useEventListener`, which cannot capture — so it
 * runs before every other keydown handler: the closing `Enter` is swallowed
 * there, and neither the home keypad's charge nor a focused form's implicit
 * submit ever sees it. The code's own characters cannot be held back the
 * same way (the first one arrives before anything marks it as a scan), so
 * they still reach whatever has focus; a caller with a focused text field
 * in play clears it in `onScan`.
 */
export function useHardwareScanner({
  enabled,
  onScan,
}: {
  readonly enabled: boolean
  readonly onScan: (code: string) => void
}) {
  const handleScan = useEffectEvent(onScan)

  useEffect(() => {
    if (!enabled) return

    let buffer = emptyScanBuffer
    const handleKeydown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.altKey || event.metaKey || event.isComposing) {
        buffer = emptyScanBuffer
        return
      }

      const result = readScanKey(buffer, event)
      buffer = result.buffer
      if (result.scanned === null) return

      event.preventDefault()
      event.stopPropagation()
      handleScan(result.scanned)
    }

    window.addEventListener("keydown", handleKeydown, { capture: true })
    return () => {
      window.removeEventListener("keydown", handleKeydown, { capture: true })
    }
  }, [enabled])
}
