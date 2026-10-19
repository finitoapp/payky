import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake"
import { useEffect, useId } from "react"

/**
 * Web's `useScreenWakeLock`: keeps the display on for as long as `enabled` is
 * true, as a terminal showing a payment QR or an open cart must not dim
 * mid-transaction. Each caller holds its own tag, so one screen releasing
 * its lock (the bill closing over the home screen) leaves another's alone.
 * A failure only means the screen may dim, so it is dropped.
 */
export function useScreenWakeLock(enabled: boolean) {
  const tag = useId()
  useEffect(() => {
    if (!enabled) return
    void activateKeepAwakeAsync(tag).catch(() => undefined)
    return () => {
      void deactivateKeepAwake(tag).catch(() => undefined)
    }
  }, [enabled, tag])
}
