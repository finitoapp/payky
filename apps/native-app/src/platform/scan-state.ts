/** The camera permission as the scanner screen shows it. */
export type ScanPermissionView =
  | "checking"
  | "request"
  | "open-settings"
  | "granted"

/**
 * Maps expo-camera's permission response: ask while Android still may show
 * its prompt, send the user to app settings once it will not (`canAskAgain`
 * false after a denial).
 */
export const scanPermissionView = (
  permission: {
    readonly granted: boolean
    readonly canAskAgain: boolean
  } | null
): ScanPermissionView => {
  if (permission === null) return "checking"
  if (permission.granted) return "granted"
  return permission.canAskAgain ? "request" : "open-settings"
}

/**
 * Decides whether a camera read is acted on: never while a previous handler
 * is in flight, and never the same value again within `repeatDelayMs`.
 */
export const shouldAcceptScan = (
  last: { readonly value: string; readonly at: number } | null,
  value: string,
  now: number,
  repeatDelayMs: number
): boolean =>
  last === null || last.value !== value || now - last.at >= repeatDelayMs
