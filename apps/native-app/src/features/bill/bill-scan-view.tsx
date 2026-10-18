import type { ReactNode } from "react"
import { Text, YStack } from "tamagui"
import { ScanCodeScanner } from "../../components/scan-code-scanner.tsx"
import { useTranslation } from "../../hooks/use-translation.ts"

/**
 * Replaces the item grid on `/bill` while scan mode is on: the camera on top
 * and, below it, `lastScanned` (the page's own item brick, so its quantity
 * controls are the grid's). What a scan does lives in the page.
 */
export function BillScanView({
  paused,
  onScan,
  lastScanned,
}: {
  readonly paused: boolean
  readonly onScan: (rawValue: string) => void
  /** `null` until something was scanned. */
  readonly lastScanned: ReactNode
}) {
  const { t } = useTranslation()
  return (
    <YStack flex={1} gap="3">
      <ScanCodeScanner onScan={onScan} paused={paused} />
      {lastScanned ?? (
        <Text color="muted-foreground" text="center">
          {t("bill.scan.lastScanned.empty")}
        </Text>
      )}
    </YStack>
  )
}
