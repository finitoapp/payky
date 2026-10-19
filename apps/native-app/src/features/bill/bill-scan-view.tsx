import type { ReactNode } from "react"
import { Text, View, YStack } from "tamagui"
import { ScanCodeScanner } from "../../components/scan-code-scanner.tsx"
import { useTranslation } from "../../hooks/use-translation.ts"
import { radius } from "../../theme/tokens.ts"

/**
 * Replaces the item grid on `/bill` while scan mode is on: the camera on top
 * and, below it, `lastScanned` (the page's own item brick, so its quantity
 * controls are the grid's). What a scan does lives in the page. As web's,
 * the camera sits in a rounded clipped frame and the empty state is a
 * centered muted line.
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
    <YStack flex={1} gap={8}>
      <View rounded={radius.lg} overflow="hidden">
        <ScanCodeScanner onScan={onScan} paused={paused} />
      </View>
      {lastScanned ?? (
        <Text mt={40} color="muted-foreground" text="center">
          {t("bill.scan.lastScanned.empty")}
        </Text>
      )}
    </YStack>
  )
}
