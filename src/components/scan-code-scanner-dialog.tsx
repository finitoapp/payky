import { ScanCodeScanner } from "@/components/scan-code-scanner.tsx"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx"
import { useTranslation } from "@/hooks/use-translation.ts"

/**
 * Scanner popup for a text input's trailing scan button (e.g. the catalog
 * item `scanCode` field). Closes itself as soon as a code is scanned.
 */
export function ScanCodeScannerDialog({
  open,
  onOpenChange,
  onScan,
}: {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly onScan: (rawValue: string) => void
}) {
  const { t } = useTranslation()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("scanner.dialog.title")}</DialogTitle>
        </DialogHeader>
        <div className="relative h-80 overflow-hidden rounded-lg bg-black">
          {open && (
            <ScanCodeScanner
              onScan={(rawValue) => {
                onScan(rawValue)
                onOpenChange(false)
              }}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
