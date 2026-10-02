import { useEffect, useEffectEvent } from "react"

/**
 * Longest gap between two keys of one scan. A keyboard-wedge (HID) scanner
 * types a whole code within a few milliseconds per key; a person cannot
 * keep that pace up, which is the only thing telling a scan apart from
 * typing.
 */
// ponytail: one fixed threshold for every scanner; make it a device setting if a slow Bluetooth scanner misses scans
export const MAX_SCAN_KEY_GAP_MS = 50
/** Shorter bursts are ignored, so a fast "12⏎" on the keypad stays a charge. */
export const MIN_SCAN_LENGTH = 4

export interface ScanBuffer {
  readonly code: string
  readonly lastKeyAt: number
}

export const emptyScanBuffer: ScanBuffer = {
  code: "",
  lastKeyAt: Number.NEGATIVE_INFINITY,
}

/**
 * Folds one keydown into `buffer`. A printable key extends the burst when it
 * follows the previous one fast enough and starts a new burst otherwise;
 * `Enter` closing a long enough burst yields the scanned code. `Shift` (sent
 * before every uppercase letter of an alphanumeric code) is skipped; any
 * other key breaks the burst.
 */
export function readScanKey(
  buffer: ScanBuffer,
  { key, timeStamp }: { readonly key: string; readonly timeStamp: number }
): { readonly buffer: ScanBuffer; readonly scanned: string | null } {
  if (key === "Shift") return { buffer, scanned: null }

  const continued = timeStamp - buffer.lastKeyAt <= MAX_SCAN_KEY_GAP_MS

  if (key === "Enter") {
    const scanned =
      continued && buffer.code.length >= MIN_SCAN_LENGTH ? buffer.code : null
    return { buffer: emptyScanBuffer, scanned }
  }

  if (key.length !== 1) return { buffer: emptyScanBuffer, scanned: null }

  return {
    buffer: {
      code: continued ? buffer.code + key : key,
      lastKeyAt: timeStamp,
    },
    scanned: null,
  }
}

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
