import { useEffect, useRef } from "react"

interface WakeLockSentinelLike extends EventTarget {
  release(): Promise<void>
}

interface WakeLockLike {
  request(type: "screen"): Promise<WakeLockSentinelLike>
}

type WakeLockNavigator = {
  readonly wakeLock?: WakeLockLike
}

function getWakeLockNavigator(): WakeLockNavigator {
  return globalThis.navigator as WakeLockNavigator
}

export function useScreenWakeLock(enabled: boolean): {
  readonly supported: boolean
} {
  const supported =
    typeof globalThis.navigator !== "undefined" &&
    getWakeLockNavigator().wakeLock !== undefined
  const wakeLockRef = useRef<WakeLockSentinelLike | null>(null)
  const requestIdRef = useRef(0)

  useEffect(() => {
    if (!supported) {
      return
    }

    const releaseWakeLock = async () => {
      requestIdRef.current += 1
      const wakeLock = wakeLockRef.current
      wakeLockRef.current = null

      if (wakeLock === null) return

      try {
        await wakeLock.release()
      } catch {
        // Ignore release failures - the lock may already be gone.
      }
    }

    const acquireWakeLock = async () => {
      if (!enabled || globalThis.document.visibilityState !== "visible") {
        return
      }

      const currentRequestId = requestIdRef.current + 1
      requestIdRef.current = currentRequestId

      try {
        const wakeLock =
          await getWakeLockNavigator().wakeLock?.request("screen")

        if (wakeLock === undefined) {
          return
        }

        if (currentRequestId !== requestIdRef.current) {
          await wakeLock.release().catch(() => undefined)
          return
        }

        wakeLock.addEventListener(
          "release",
          () => {
            if (wakeLockRef.current === wakeLock) {
              wakeLockRef.current = null
            }

            if (enabled && globalThis.document.visibilityState === "visible") {
              void acquireWakeLock()
            }
          },
          { once: true }
        )

        wakeLockRef.current = wakeLock
      } catch {
        // Ignore request failures - unsupported browsers or revoked access.
      }
    }

    const handleVisibilityChange = () => {
      if (globalThis.document.visibilityState === "visible") {
        void acquireWakeLock()
        return
      }

      void releaseWakeLock()
    }

    const handlePageShow = () => {
      void acquireWakeLock()
    }

    const handlePageHide = () => {
      void releaseWakeLock()
    }

    globalThis.document.addEventListener(
      "visibilitychange",
      handleVisibilityChange
    )
    globalThis.window.addEventListener("pageshow", handlePageShow)
    globalThis.window.addEventListener("pagehide", handlePageHide)

    void acquireWakeLock()

    return () => {
      void releaseWakeLock()
      globalThis.document.removeEventListener(
        "visibilitychange",
        handleVisibilityChange
      )
      globalThis.window.removeEventListener("pageshow", handlePageShow)
      globalThis.window.removeEventListener("pagehide", handlePageHide)
    }
  }, [enabled, supported])

  return {
    supported,
  }
}
