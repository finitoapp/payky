import type { IScannerHandle } from "@yudiel/react-qr-scanner"
import { type RefObject, useCallback, useEffect, useRef, useState } from "react"
import { z } from "zod"
import { useLocalStorageState } from "@/hooks/use-local-storage-state.ts"

const SCANNER_TORCH_STORAGE_KEY = "payky.scannerTorchEnabled"

// Bounds the "wait for a live camera track" poll below: if the camera never
// starts (permission denied, no device, ...) this stops the
// `requestAnimationFrame` loop instead of spinning on every frame for as
// long as the scanner stays mounted.
const TRACK_SYNC_TIMEOUT_MS = 5000

/**
 * `torch` is a non-standard, Chromium-only constrainable property: it's
 * missing from lib.dom.d.ts's `MediaTrackConstraintSet`/`MediaTrackCapabilities`.
 */
interface TorchConstraintSet extends MediaTrackConstraintSet {
  readonly torch?: boolean
}

interface TorchCapabilities extends MediaTrackCapabilities {
  readonly torch?: boolean
}

function getVideoTrack(
  scannerRef: RefObject<IScannerHandle | null>
): MediaStreamTrack | undefined {
  return scannerRef.current?.getStream()?.getVideoTracks()[0]
}

function applyTorchConstraint(track: MediaStreamTrack, torch: boolean) {
  const constraintSet: TorchConstraintSet = { torch }
  track.applyConstraints({ advanced: [constraintSet] }).catch(() => {})
}

/**
 * Persists the scanner's flashlight/torch toggle across every
 * `@yudiel/react-qr-scanner` instance in the app (shared `localStorage` key —
 * view state, not application data, so it belongs outside the device Evolu
 * database; see `useLocalStorageState`), and re-applies the stored
 * preference to the camera track as soon as one becomes available. The
 * library exposes no controlled torch prop, so the hardware constraint is
 * applied directly on the track handed back through
 * `IScannerHandle.getStream()`.
 */
export function useScannerTorch(
  scannerRef: RefObject<IScannerHandle | null>,
  active: boolean
) {
  const [torchOn, setTorchOn] = useLocalStorageState(
    SCANNER_TORCH_STORAGE_KEY,
    false,
    z.boolean()
  )
  const [torchSupported, setTorchSupported] = useState(false)
  const torchOnRef = useRef(torchOn)
  torchOnRef.current = torchOn

  useEffect(() => {
    if (!active) {
      setTorchSupported(false)
      return undefined
    }

    let cancelled = false
    let frameId: number
    const deadline = Date.now() + TRACK_SYNC_TIMEOUT_MS

    const syncTrack = () => {
      if (cancelled) return

      const track = getVideoTrack(scannerRef)
      const capabilities = track?.getCapabilities?.() as
        | TorchCapabilities
        | undefined

      if (track === undefined || capabilities === undefined) {
        if (Date.now() < deadline) {
          frameId = requestAnimationFrame(syncTrack)
        }
        return
      }

      const supported = capabilities.torch === true
      setTorchSupported(supported)

      if (supported && torchOnRef.current) {
        applyTorchConstraint(track, true)
      }
    }

    syncTrack()

    return () => {
      cancelled = true
      cancelAnimationFrame(frameId)
    }
  }, [active, scannerRef])

  const toggleTorch = useCallback(() => {
    setTorchOn((previous) => {
      const next = !previous
      const track = getVideoTrack(scannerRef)
      if (track !== undefined) {
        applyTorchConstraint(track, next)
      }
      return next
    })
  }, [scannerRef, setTorchOn])

  return { torchOn, torchSupported, toggleTorch }
}
