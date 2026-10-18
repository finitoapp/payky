import { disableAccessControl } from "@payky/core/modules/access/access-actions"
import { accessControlQuery } from "@payky/core/modules/access/access-queries"
import { decodePinHash } from "@payky/core/modules/access/access-utils"
import { devicesQuery } from "@payky/core/modules/device/device-queries"
import { useState } from "react"
import { Text, YStack } from "tamagui"
import { AppButton } from "../../../components/app-button.tsx"
import { Screen } from "../../../components/screen.tsx"
import { ScreenHeader } from "../../../components/screen-header.tsx"
import { useAccess, useRequirePermission } from "../../../core/use-access.ts"
import { useEvoluQuery } from "../../../hooks/use-evolu-query.ts"
import { useRunToast } from "../../../hooks/use-run-toast.ts"
import { useTranslation } from "../../../hooks/use-translation.ts"
import { ChangePinCard } from "./change-pin-card.tsx"
import { DeviceItem } from "./device-item.tsx"
import { TurnOnWizard } from "./turn-on-wizard.tsx"

/**
 * Settings → Access (access/0001, access/0004), as web's
 * `AccessSettingsPage`. The route is `admin` (access/0002).
 */
export function AccessSettingsPage() {
  const { t } = useTranslation()
  const { data: control } = useEvoluQuery(accessControlQuery)
  const enabled = control[0]?.enabled === 1
  const hasPin = decodePinHash(control[0]?.pin ?? null) !== null
  const [mode, setMode] = useState<"view" | "wizard" | "changePin">("view")
  const toView = () => setMode("view")

  return (
    <Screen>
      <ScreenHeader title={t("access.title")} />
      {mode === "wizard" ? (
        <TurnOnWizard hasPin={hasPin} onDone={toView} />
      ) : mode === "changePin" ? (
        <ChangePinCard onDone={toView} />
      ) : (
        <StatusCard
          enabled={enabled}
          onTurnOn={() => setMode("wizard")}
          onChangePin={() => setMode("changePin")}
        />
      )}
      {mode === "wizard" ? null : <DevicesCard />}
    </Screen>
  )
}

function StatusCard({
  enabled,
  onTurnOn,
  onChangePin,
}: {
  readonly enabled: boolean
  readonly onTurnOn: () => void
  readonly onChangePin: () => void
}) {
  const { t } = useTranslation()
  const runToast = useRunToast()
  const { requirePin } = useRequirePermission()

  // Always the current PIN, even on a device with `admin` (access/0001),
  // awaited before the Task; the PIN is kept for turning it on again.
  const turnOff = async () => {
    if (!(await requirePin("access.action.disable"))) return
    await runToast(async (run) => {
      await run.ok(disableAccessControl())
    })
  }

  return (
    <YStack gap="3">
      <Text fontSize="xl" fontWeight="700">
        {t(enabled ? "access.status.on" : "access.status.off")}
      </Text>
      <Text color="muted-foreground">{t("access.description")}</Text>
      {enabled ? (
        <>
          <AppButton
            variant="secondary"
            label={t("access.changePin")}
            onPress={onChangePin}
          />
          <AppButton
            variant="secondary"
            label={t("access.turnOff")}
            onPress={() => {
              void turnOff()
            }}
          />
        </>
      ) : (
        <AppButton label={t("access.turnOn")} onPress={onTurnOn} />
      )}
    </YStack>
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
