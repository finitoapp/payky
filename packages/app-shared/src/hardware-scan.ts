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
