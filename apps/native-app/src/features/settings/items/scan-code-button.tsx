import { useState } from "react"
import { YStack } from "tamagui"
import { ScanCodeScanner } from "../../../components/scan-code-scanner.tsx"
import { Button } from "../../../components/ui/button.tsx"
import { useTranslation } from "../../../hooks/use-translation.ts"

/**
 * Opens the camera under a scan code field; the first code read closes it
 * and goes to `onScan`, which validates it (the string is untrusted).
 */
export function ScanCodeButton({
  disabled = false,
  onScan,
}: {
  readonly disabled?: boolean
  readonly onScan: (rawValue: string) => void
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)

  return (
    <YStack gap="2">
      <Button
        size="lg"
        label={t(
          open ? "inlineEdit.discard" : "settings.items.form.scanCode.scan.aria"
        )}
        variant="outline"
        disabled={disabled}
        onPress={() => setOpen((current) => !current)}
      />
      {open && (
        <ScanCodeScanner
          onScan={(rawValue) => {
            setOpen(false)
            onScan(rawValue)
          }}
        />
      )}
    </YStack>
  )
}
