import { LoaderCircleIcon } from "lucide-react"
import { QRCodeSVG } from "qrcode.react"
import { toast } from "sonner"

type CopyableQrCodeState =
  | { readonly state: "ready"; readonly value: string }
  | { readonly state: "pending"; readonly pendingLabel: string }
  | { readonly state: "empty" }

export type CopyableQrCodeProps = CopyableQrCodeState & {
  readonly ariaLabel: string
  readonly copiedMessage: string
  readonly copyFailedMessage: string
}

export function CopyableQrCode(props: CopyableQrCodeProps) {
  const { ariaLabel, copiedMessage, copyFailedMessage } = props

  const copyValue = async () => {
    if (props.state !== "ready") return

    try {
      await navigator.clipboard.writeText(props.value)
      toast.success(copiedMessage)
    } catch {
      toast.error(copyFailedMessage)
    }
  }

  return (
    <div className="w-full">
      <button
        type="button"
        disabled={props.state !== "ready"}
        className="aspect-square w-full rounded-xl bg-white p-4 text-black ring-1 ring-foreground/10 transition-transform active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-default"
        onClick={() => void copyValue()}
        aria-label={ariaLabel}
      >
        <span className="flex size-full flex-col items-center justify-center">
          {props.state === "ready" ? (
            <QRCodeSVG value={props.value} className="size-full" />
          ) : props.state === "pending" ? (
            <span className="flex flex-col items-center gap-2 text-sm text-neutral-500">
              <LoaderCircleIcon className="animate-spin" />
              <span>{props.pendingLabel}</span>
            </span>
          ) : null}
        </span>
      </button>
    </div>
  )
}
