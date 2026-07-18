import { useWakeLock } from "@dedalik/use-react"
import { useEffect } from "react"

export function useScreenWakeLock(enabled: boolean): {
  readonly supported: boolean
} {
  const { isSupported, release, request } = useWakeLock()

  useEffect(() => {
    if (!enabled) return

    void request()

    return () => {
      void release().catch(() => undefined)
    }
  }, [enabled, release, request])

  return {
    supported: isSupported,
  }
}
