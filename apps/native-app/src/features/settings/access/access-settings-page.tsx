import { accessControlQuery } from "@payky/core/modules/access/access-queries"
import { devicesQuery } from "@payky/core/modules/device/device-queries"
import { Text, YStack } from "tamagui"
import { Screen } from "../../../components/screen.tsx"
import { ScreenHeader } from "../../../components/screen-header.tsx"
import { useAccess } from "../../../core/use-access.ts"
import { useEvoluQuery } from "../../../hooks/use-evolu-query.ts"
import { useTranslation } from "../../../hooks/use-translation.ts"
import { DeviceItem } from "./device-item.tsx"

/**
 * Settings → Access (access/0001, access/0004), as web's
 * `AccessSettingsPage`. The route is `admin` (access/0002).
 */
export function AccessSettingsPage() {
  const { t } = useTranslation()
  const { data: control } = useEvoluQuery(accessControlQuery)
  const enabled = control[0]?.enabled === 1

  return (
    <Screen>
      <ScreenHeader title={t("access.title")} />
      <YStack gap="2">
        <Text fontSize="xl" fontWeight="700">
          {t(enabled ? "access.status.on" : "access.status.off")}
        </Text>
        <Text color="muted-foreground">{t("access.description")}</Text>
      </YStack>
      <DevicesCard />
    </Screen>
  )
}

function DevicesCard() {
  const { t } = useTranslation()
  const { deviceId } = useAccess()
  const { data: devices } = useEvoluQuery(devicesQuery)

  return (
    <YStack gap="3">
      <Text fontWeight="700">{t("access.devices.title")}</Text>
      <Text color="muted-foreground">{t("access.devices.description")}</Text>
      {devices.map((device) => (
        <DeviceItem
          key={device.id}
          device={device}
          thisDevice={device.id === deviceId}
        />
      ))}
    </YStack>
  )
}
