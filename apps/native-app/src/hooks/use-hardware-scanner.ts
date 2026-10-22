import { emptyScanBuffer, readScanKey } from "@payky/app-shared/hardware-scan"
import { useIsFocused } from "expo-router"
import { useEffect, useEffectEvent } from "react"
import { addHardwareKeyListener } from "../platform/hardware-keys"

/**
 * Reports codes from a keyboard-wedge barcode scanner while `enabled`, as
 * web's hook (docs/decisions/scanner/0001) and with the same classification
 * (`readScanKey`). Unlike on web the closing Enter is not swallowed: on
 * Android the key reaches JS only after native has passed it on, so a
 * focused text field still sees it, and the web build keeps it the same. The
 * terminal keypad, which sees the same keys, therefore tells the scan apart
 * itself (`readKeypadKey`). Listens only while its screen is focused, so a
 * screen under the one on top never reacts to the same scan. Not verified
 * against a real scanner.
 */
export function useHardwareScanner({
  enabled,
  onScan,
}: {
  readonly enabled: boolean
  readonly onScan: (code: string) => void
}) {
  const handleScan = useEffectEvent(onScan)
  const focused = useIsFocused()

  useEffect(() => {
    if (!enabled || !focused) return

    let buffer = emptyScanBuffer
    return addHardwareKeyListener((event) => {
      const result = readScanKey(buffer, event)
      buffer = result.buffer
      if (result.scanned !== null) handleScan(result.scanned)
    })
  }, [enabled, focused])
}
