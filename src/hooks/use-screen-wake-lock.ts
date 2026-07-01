import { useEffect, useMemo } from "react"

export interface WakeLockSentinelLike extends EventTarget {
  release(): Promise<void>
}

export interface WakeLockLike {
  request(type: "screen"): Promise<WakeLockSentinelLike>
}

type WakeLockNavigator = {
  readonly wakeLock?: WakeLockLike
}

interface ScreenWakeLockControllerDeps {
  readonly document: Pick<
    Document,
    "addEventListener" | "removeEventListener" | "visibilityState"
  >
  readonly window: Pick<Window, "addEventListener" | "removeEventListener">
  readonly wakeLock: WakeLockLike
}

interface ScreenWakeLockController {
  start(): void
  stop(): void
}

function getWakeLockNavigator(): WakeLockNavigator | null {
  if (typeof globalThis.navigator === "undefined") return null

  return globalThis.navigator as WakeLockNavigator
}

function canUsePage(
  document: ScreenWakeLockControllerDeps["document"]
): boolean {
  return document.visibilityState === "visible"
}

export function createScreenWakeLockController({
  document,
  wakeLock,
  window,
}: ScreenWakeLockControllerDeps): ScreenWakeLockController {
  let active = false
  let requestingWakeLock = false
  let retryWakeLockAfterPending = false
  let requestVersion = 0
  let wakeLockSentinel: WakeLockSentinelLike | null = null

  const releaseWakeLock = async () => {
    requestVersion += 1
    const currentWakeLock = wakeLockSentinel
    wakeLockSentinel = null

    if (currentWakeLock === null) return

    try {
      await currentWakeLock.release()
    } catch {
      // Ignore release failures - the lock may already be gone.
    }
  }

  const acquireWakeLock = async () => {
    if (!active || !canUsePage(document) || wakeLockSentinel !== null) {
      return
    }

    if (requestingWakeLock) {
      retryWakeLockAfterPending = true
      return
    }

    requestingWakeLock = true
    retryWakeLockAfterPending = false
    const currentRequestVersion = requestVersion + 1
    requestVersion = currentRequestVersion

    try {
      const nextWakeLock = await wakeLock.request("screen")

      if (
        !active ||
        !canUsePage(document) ||
        currentRequestVersion !== requestVersion
      ) {
        await nextWakeLock.release().catch(() => undefined)
        return
      }

      nextWakeLock.addEventListener(
        "release",
        () => {
          const releasedActiveLock = wakeLockSentinel === nextWakeLock
          if (releasedActiveLock) {
            wakeLockSentinel = null
          }

          if (releasedActiveLock && active && canUsePage(document)) {
            void acquireWakeLock()
          }
        },
        { once: true }
      )

      wakeLockSentinel = nextWakeLock
    } catch {
      // Ignore request failures - permission denials or transient browser issues.
    } finally {
      requestingWakeLock = false
      const shouldRetryWakeLock =
        retryWakeLockAfterPending &&
        active &&
        canUsePage(document) &&
        wakeLockSentinel === null

      retryWakeLockAfterPending = false

      if (shouldRetryWakeLock) {
        void acquireWakeLock()
      }
    }
  }

  const handleVisibilityChange = () => {
    if (canUsePage(document)) {
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

  return {
    start() {
      if (active) return

      active = true
      document.addEventListener("visibilitychange", handleVisibilityChange)
      window.addEventListener("pageshow", handlePageShow)
      window.addEventListener("pagehide", handlePageHide)

      void acquireWakeLock()
    },
    stop() {
      if (!active) return

      active = false
      document.removeEventListener("visibilitychange", handleVisibilityChange)
      window.removeEventListener("pageshow", handlePageShow)
      window.removeEventListener("pagehide", handlePageHide)
      void releaseWakeLock()
    },
  }
}

export function useScreenWakeLock(enabled: boolean): {
  readonly supported: boolean
} {
  const wakeLock = getWakeLockNavigator()?.wakeLock
  const supported = wakeLock !== undefined
  const controller = useMemo(() => {
    if (!supported || wakeLock === undefined) return null

    return createScreenWakeLockController({
      document: globalThis.document,
      wakeLock,
      window: globalThis.window,
    })
  }, [supported, wakeLock])

  useEffect(() => {
    if (!enabled || controller === null) return

    controller.start()

    return () => {
      controller.stop()
    }
  }, [controller, enabled])

  return {
    supported,
  }
}
