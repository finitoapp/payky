import { type IDetectedBarcode, Scanner } from "@yudiel/react-qr-scanner"
import { XIcon } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button.tsx"
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
          onScan={handleScan}
          onError={() => setHasError(true)}
          constraints={{ facingMode: "environment" }}
          formats={["qr_code"]}
          allowMultiple={false}
        />
      </div>
      {hasError ? (
        <p className="px-4 py-3 text-center text-sm text-red-400">
          {t("withdraw.scan.error")}
        </p>
      ) : null}
    </div>
  )
}
