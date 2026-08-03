import { LoaderCircleIcon } from "lucide-react"
import { QRCodeSVG } from "qrcode.react"
import { toast } from "sonner"

export interface CopyableQrCodeProps {
  readonly value: string | null
  readonly ariaLabel: string
  readonly copiedMessage: string
  readonly copyFailedMessage: string
  readonly pendingLabel?: string
}

export function CopyableQrCode({
  value,
  ariaLabel,
  copiedMessage,
  copyFailedMessage,
  pendingLabel,
}: CopyableQrCodeProps) {
  const copyValue = async () => {
    if (value === null) return

    try {
      await navigator.clipboard.writeText(value)
      toast.success(copiedMessage)
    } catch {
      toast.error(copyFailedMessage)
    }
  }

  return (
    <div className="w-full">
      <button
        type="button"
        disabled={value === null}
        className="aspect-square w-full rounded-xl bg-white p-4 text-black ring-1 ring-foreground/10 transition-transform active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-default"
        onClick={() => void copyValue()}
        aria-label={ariaLabel}
      >
        <span className="flex size-full flex-col items-center justify-center">
          {value !== null ? (
            <QRCodeSVG value={value} className="size-full" />
          ) : pendingLabel !== undefined ? (
            <span className="flex flex-col items-center gap-2 text-sm text-neutral-500">
              <LoaderCircleIcon className="animate-spin" />
              <span>{pendingLabel}</span>
            </span>
          ) : null}
        </span>
      </button>
    </div>
  )
}
