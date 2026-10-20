import Copy from "lucide-react-native/icons/copy"
import { useCopyToClipboard } from "../hooks/use-copy-to-clipboard.ts"
import { Button } from "./ui/button.tsx"

/**
 * The copy button beside a value, as web draws it in its copy rows (the
 * payment detail identifiers, the IBAN fields): a ghost icon button with
 * lucide `Copy`. Messages arrive translated.
 */
export function CopyLink({
  value,
  "aria-label": ariaLabel,
  copied,
  failed,
  size = "icon-xs",
}: {
  readonly value: string
  readonly "aria-label": string
  readonly copied: string
  readonly failed: string
  /** Web's `icon-xs` in detail rows, `icon` in the IBAN fields. */
  readonly size?: "icon-xs" | "icon"
}) {
  const copy = useCopyToClipboard()
  return (
    <Button
      variant="ghost"
      size={size}
      iconStart={Copy}
      aria-label={ariaLabel}
      onPress={() => void copy(value, { copied, failed })}
    />
  )
}
