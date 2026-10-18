import { useState } from "react"
import { YStack } from "tamagui"
import { AppButton } from "../../../components/app-button.tsx"
import { ScanCodeScanner } from "../../../components/scan-code-scanner.tsx"
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
      <AppButton
        label={t(
          open ? "inlineEdit.discard" : "settings.items.form.scanCode.scan.aria"
        )}
        variant="secondary"
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
