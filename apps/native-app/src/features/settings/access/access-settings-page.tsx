import { disableAccessControl } from "@payky/core/modules/access/access-actions"
import { accessControlQuery } from "@payky/core/modules/access/access-queries"
import { decodePinHash } from "@payky/core/modules/access/access-utils"
import { devicesQuery } from "@payky/core/modules/device/device-queries"
import { router } from "expo-router"
import KeyRound from "lucide-react-native/icons/key-round"
import MonitorSmartphone from "lucide-react-native/icons/monitor-smartphone"
import ShieldCheck from "lucide-react-native/icons/shield-check"
import ShieldOff from "lucide-react-native/icons/shield-off"
import { useState } from "react"
import { XStack, YStack } from "tamagui"
import { FadeHeader } from "../../../components/fade-header.tsx"
import { Screen } from "../../../components/screen.tsx"
import { Button } from "../../../components/ui/button.tsx"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "../../../components/ui/card.tsx"
import { Icon } from "../../../components/ui/icon.tsx"
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
  const { accountId } = useAccess()
  // Keyed by account, so an account switch drops the wizard's PIN digits and
  // its keep-current-PIN approval.
  return <AccessSettings key={accountId} />
}

function AccessSettings() {
  const { t } = useTranslation()
  const { data: control } = useEvoluQuery(accessControlQuery)
  const enabled = control[0]?.enabled === 1
  const hasPin = decodePinHash(control[0]?.pin ?? null) !== null
  const [mode, setMode] = useState<"view" | "wizard" | "changePin">("view")
  const toView = () => setMode("view")

  return (
    <Screen>
      <FadeHeader title={t("access.title")} />
      <YStack gap="5">
        {mode === "wizard" && !enabled ? (
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
        {mode === "wizard" && !enabled ? null : <DevicesCard />}
      </YStack>
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
    <Card>
      <CardHeader>
        <XStack items="center" gap="2">
          <Icon
            icon={enabled ? ShieldCheck : ShieldOff}
            color={enabled ? "primary" : "muted-foreground"}
            size={20}
          />
          <CardTitle>
            {t(enabled ? "access.status.on" : "access.status.off")}
          </CardTitle>
        </XStack>
        <CardDescription>{t("access.description")}</CardDescription>
      </CardHeader>
      <CardFooter flexWrap="wrap" justify="flex-end" gap={8}>
        {enabled ? (
          <>
            <Button
              variant="outline"
              iconStart={KeyRound}
              label={t("access.changePin")}
              onPress={onChangePin}
            />
            <Button
              variant="outline"
              label={t("access.turnOff")}
              onPress={() => {
                void turnOff()
              }}
            />
          </>
        ) : (
          <Button label={t("access.turnOn")} onPress={onTurnOn} />
        )}
      </CardFooter>
    </Card>
  )
}

function DevicesCard() {
  const { t } = useTranslation()
  const { deviceId } = useAccess()
  const { data: devices } = useEvoluQuery(devicesQuery)

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("access.devices.title")}</CardTitle>
        <CardDescription>{t("access.devices.description")}</CardDescription>
      </CardHeader>
      <CardContent gap={12} testID="access-devices">
        {devices.map((device) => (
          <DeviceItem
            key={device.id}
            device={device}
            thisDevice={device.id === deviceId}
          />
        ))}
      </CardContent>
      <CardFooter justify="flex-end">
        {/* Sends this account to the new device by QR (account/0001). */}
        <Button
          variant="outline"
          iconStart={MonitorSmartphone}
          label={t("access.devices.add")}
          onPress={() => router.push("/settings/access/add-device")}
        />
      </CardFooter>
    </Card>
  )
}
