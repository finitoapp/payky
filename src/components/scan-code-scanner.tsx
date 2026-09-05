import {
  type IDetectedBarcode,
  type IScannerError,
  type IScannerHandle,
  Scanner,
} from "@yudiel/react-qr-scanner"
import type { BarcodeFormat } from "barcode-detector"
import { useCallback, useEffect, useRef, useState } from "react"

import { ScannerTorchButton } from "@/components/scanner-torch-button.tsx"
import { vibrateOnButtonPress } from "@/core/native/haptics.ts"
import { useScannerTorch } from "@/hooks/use-scanner-torch.ts"
import { useTranslation } from "@/hooks/use-translation.ts"
import type { TranslationKey } from "@/i18n/resources.ts"
import { cn } from "@/lib/utils.ts"

declare global {
  interface Window {
    /**
     * Test-only hook that feeds `rawValue` through the same accept/debounce
     * path a real camera decode takes. Registered by whichever
     * `ScanCodeScanner` is currently mounted — the app never shows more than
     * one at once — so e2e specs can drive scan-triggered flows (unknown
     * code, code collisions, quick-create) without a real camera or
     * fake-media-device setup. Dead code outside dev/the e2e test build, same
     * gating as the window.__e2e* bridges in e2e-test-bridge.tsx (kept here
     * instead of that shared file since it hooks a specific mounted
     * component's callback, not a domain action).
     */
    __e2eInjectScanCode?: (rawValue: string) => void
  }
}

// Restricting formats (the library defaults to `["any"]`) noticeably speeds
// up decoding. Covers common retail 1D symbologies plus QR/Data Matrix for
// custom-printed labels. Typed as a mutable array (not ReadonlyArray) since
// the `Scanner` component's `formats` prop requires one.
const SCAN_FORMATS: Array<BarcodeFormat> = [
  "ean_13",
  "ean_8",
  "upc_a",
  "upc_e",
  "code_128",
  "code_39",
  "itf",
  "qr_code",
]

const DEFAULT_REPEAT_DELAY_MS = 2000

const errorMessageKey = (kind: IScannerError["kind"]): TranslationKey => {
  switch (kind) {
    case "permission-denied":
      return "scanner.error.permissionDenied"
    case "insecure-context":
      return "scanner.error.insecureContext"
    case "no-camera":
      return "scanner.error.noCamera"
    case "unsupported":
      return "scanner.error.unsupported"
    default:
      return "scanner.error.generic"
  }
}

/**
 * Camera-based scanner for `catalogItem.scanCode` values (barcodes or QR
 * codes — any format the underlying library detects).
 *
 * The library has no built-in "debounce the same code, but not a different
 * one" behavior: `allowMultiple={false}` never re-fires a code that stays in
 * frame, and `scanDelay` is a global rate limit, not per-code. So this
 * component runs continuously (`allowMultiple` + `scanDelay={0}`) and tracks
 * the single most recently accepted code itself, rejecting an immediate
 * repeat of that same value within `repeatDelayMs` while letting a different
 * code through right away.
 */
export function ScanCodeScanner({
  onScan,
  paused = false,
  repeatDelayMs = DEFAULT_REPEAT_DELAY_MS,
  className,
}: {
  readonly onScan: (rawValue: string) => void
  readonly paused?: boolean
  readonly repeatDelayMs?: number
  readonly className?: string
}) {
  const { t } = useTranslation()
  const [errorKey, setErrorKey] = useState<TranslationKey | null>(null)
  const lastAcceptedRef = useRef<{
    rawValue: string
    timestamp: number
  } | null>(null)
  const scannerRef = useRef<IScannerHandle>(null)
  const { torchOn, torchSupported, toggleTorch } = useScannerTorch(
    scannerRef,
    !paused
  )

  const processScannedValue = useCallback(
    (rawValue: string) => {
      const now = Date.now()
      const lastAccepted = lastAcceptedRef.current
      if (
        lastAccepted !== null &&
        lastAccepted.rawValue === rawValue &&
        now - lastAccepted.timestamp < repeatDelayMs
      ) {
        return
      }

      lastAcceptedRef.current = { rawValue, timestamp: now }
      setErrorKey(null)
      vibrateOnButtonPress()
      onScan(rawValue)
    },
    [onScan, repeatDelayMs]
  )

  const handleScan = useCallback(
    (detectedCodes: ReadonlyArray<IDetectedBarcode>) => {
      const [first] = detectedCodes
      if (!first) return
      processScannedValue(first.rawValue)
    },
    [processScannedValue]
  )

  useEffect(() => {
    if (!import.meta.env.DEV && !__E2E_TEST_BUILD__) return

    window.__e2eInjectScanCode = processScannedValue

    return () => {
      delete window.__e2eInjectScanCode
    }
  }, [processScannedValue])

  return (
    <div className={cn("relative size-full overflow-hidden", className)}>
      <Scanner
        ref={scannerRef}
        paused={paused}
        onScan={handleScan}
        onError={(error) => setErrorKey(errorMessageKey(error.kind))}
        constraints={{
          facingMode: "environment",
          width: { ideal: 1280 },
          height: { ideal: 720 },
        }}
        formats={SCAN_FORMATS}
        allowMultiple
        scanDelay={0}
        retryDelay={150}
        sound={false}
        components={{ torch: false }}
        styles={{ container: { aspectRatio: "auto", height: "100%" } }}
      />
      {torchSupported && !paused && (
        <ScannerTorchButton torchOn={torchOn} onToggle={toggleTorch} />
      )}
      {errorKey && (
        <p className="absolute inset-x-0 bottom-0 bg-black/70 px-4 py-3 text-center text-sm text-red-400">
          {t(errorKey)}
        </p>
      )}
    </div>
  )
}
