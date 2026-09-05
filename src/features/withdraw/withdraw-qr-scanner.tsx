import {
  type IDetectedBarcode,
  type IScannerHandle,
  Scanner,
} from "@yudiel/react-qr-scanner"
import { XIcon } from "lucide-react"
import { useRef, useState } from "react"

import { ScannerTorchButton } from "@/components/scanner-torch-button.tsx"
import { Button } from "@/components/ui/button.tsx"
import { useScannerTorch } from "@/hooks/use-scanner-torch.ts"
import { useTranslation } from "@/hooks/use-translation.ts"
import {
  parseScannedBitcoinAddress,
  type ScannedBitcoinAddress,
} from "./withdraw-utils.ts"

export function WithdrawQrScanner({
  onScan,
  onClose,
}: {
  readonly onScan: (result: ScannedBitcoinAddress) => void
  readonly onClose: () => void
}) {
  const { t } = useTranslation()
  const [hasError, setHasError] = useState(false)
  const scannerRef = useRef<IScannerHandle>(null)
  const { torchOn, torchSupported, toggleTorch } = useScannerTorch(
    scannerRef,
    true
  )

  const handleScan = (detectedCodes: ReadonlyArray<IDetectedBarcode>) => {
    const [first] = detectedCodes
    if (!first) return

    onScan(parseScannedBitcoinAddress(first.rawValue))
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      <div className="flex items-center justify-between px-4 py-3">
        <p className="text-sm font-medium text-white">
          {t("withdraw.scan.title")}
        </p>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="text-white hover:bg-white/10 hover:text-white"
          onClick={onClose}
          aria-label={t("withdraw.scan.close")}
        >
          <XIcon />
        </Button>
      </div>
      <div className="relative flex-1">
        <Scanner
          ref={scannerRef}
          onScan={handleScan}
          onError={() => setHasError(true)}
          constraints={{ facingMode: "environment" }}
          formats={["qr_code"]}
          allowMultiple={false}
          components={{ torch: false }}
        />
        {torchSupported && (
          <ScannerTorchButton torchOn={torchOn} onToggle={toggleTorch} />
        )}
      </div>
      {hasError ? (
        <p className="px-4 py-3 text-center text-sm text-red-400">
          {t("withdraw.scan.error")}
        </p>
      ) : null}
    </div>
  )
}
