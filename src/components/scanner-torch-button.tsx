import { Flashlight, FlashlightOff } from "lucide-react"
import { useTranslation } from "@/hooks/use-translation.ts"
import { cn } from "@/lib/utils.ts"

export function ScannerTorchButton({
  torchOn,
  onToggle,
  className,
}: {
  readonly torchOn: boolean
  readonly onToggle: () => void
  readonly className?: string
}) {
  const { t } = useTranslation()

  return (
    <button
      type="button"
      aria-label={t(torchOn ? "scanner.torch.off" : "scanner.torch.on")}
      aria-pressed={torchOn}
      onClick={onToggle}
      className={cn(
        "absolute right-3 bottom-3 rounded-full bg-black/60 p-2.5 text-white",
        className
      )}
    >
      {torchOn ? (
        <FlashlightOff className="size-5" />
      ) : (
        <Flashlight className="size-5" />
      )}
    </button>
  )
}
