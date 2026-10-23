import { nativeEnv } from "../core/native-env.ts"

// Module state: it lives until the app restarts. On web a link reloads the
// page, so a flow goes offline with the `offline` action's `next=`.
let offline = false

/**
 * Web's `context.setOffline(true)`, which Maestro has no counterpart for on
 * web: the restore sync screen then reads the device as offline (only that
 * screen; requests still go out).
 */
export const setE2eOffline = (value: boolean) => {
  offline = value
}

/** Whether an e2e build was told to read the device as offline. */
export const isE2eOffline = (): boolean =>
  nativeEnv.EXPO_PUBLIC_PAYKY_E2E && offline
