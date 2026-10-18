import { wizardDeviceDefaults } from "@payky/app-shared/access-form"
import { accessSessionAtom } from "@payky/app-shared/access-state"
import { enableAccessControl } from "@payky/core/modules/access/access-actions"
import type { AccessPreset } from "@payky/core/modules/access/access-types"
import {
  type DeviceListRow,
  devicesQuery,
} from "@payky/core/modules/device/device-queries"
import type { DeviceId } from "@payky/core/modules/device/device-types"
import { useSetAtom } from "jotai"
import { useState } from "react"
import { Text, XStack, YStack } from "tamagui"
import { AppButton } from "../../../components/app-button.tsx"
import { useAccess, useRequirePermission } from "../../../core/use-access.ts"
import { useEvoluQuery } from "../../../hooks/use-evolu-query.ts"
import { useRunToast } from "../../../hooks/use-run-toast.ts"
import { useTranslation } from "../../../hooks/use-translation.ts"
import { DeviceHeading, PresetPicker, RenameForm } from "./device-parts.tsx"
import { NewPinFields, useNewPin } from "./new-pin-fields.tsx"

/**
 * Sets the PIN and every listed device's defaults, saved in one batch with
 * switching access control on (access/0004): otherwise every existing device
 * would stop working, the owner's own included.
 */
export function TurnOnWizard({
  hasPin,
  onDone,
}: {
  readonly hasPin: boolean
  readonly onDone: () => void
}) {
  const { t } = useTranslation()
  const runToast = useRunToast()
  const { requirePin } = useRequirePermission()
  const { accountId, deviceId } = useAccess()
  const setSession = useSetAtom(accessSessionAtom)
  const { data: devices } = useEvoluQuery(devicesQuery)
  const newPin = useNewPin()
  const [step, setStep] = useState<"pin" | "devices">("pin")
  // The current PIN, kept once it has been entered. Typing a new one drops it.
  const [keepPin, setKeepPin] = useState(false)
  const [presets, setPresets] = useState<
    Readonly<Record<DeviceId, AccessPreset>>
  >({})
  const [renaming, setRenaming] = useState<DeviceListRow | null>(null)
  const [pending, setPending] = useState(false)

  const keepCurrentPin = async () => {
    if (!(await requirePin("access.action.enable"))) return
    newPin.clear()
    setKeepPin(true)
    setStep("devices")
  }

  const finish = async () => {
    const pin = keepPin ? null : newPin.check.pin
    if (!keepPin && pin === null) return
    if (pending) return
    setPending(true)
    const saved = await runToast(async (run) => {
      const result = await run(
        enableAccessControl({
          pin,
          devices: wizardDeviceDefaults(devices, presets),
        })
      )
      if (!result.ok) return "access.wizard.noPin"
    })
    newPin.clear()
    setPending(false)
    if (!saved) return
    // Whoever just set or entered the PIN holds it: they stay on this page
    // even when the wizard took this device's own `admin` away.
    setSession({ accountId })
    onDone()
  }

  if (step === "pin") {
    return (
      <YStack gap="3">
        <Text fontSize="xl" fontWeight="700">
          {t("access.wizard.pin.title")}
        </Text>
        <Text color="muted-foreground">
          {t("access.wizard.pin.description")}
        </Text>
        {hasPin ? (
          <AppButton
            variant="secondary"
            label={t("access.wizard.keepPin")}
            onPress={() => {
              void keepCurrentPin()
            }}
          />
        ) : null}
        <NewPinFields
          state={{
            ...newPin,
            setPin: (text) => {
              setKeepPin(false)
              newPin.setPin(text)
            },
            setRepeat: (text) => {
              setKeepPin(false)
              newPin.setRepeat(text)
            },
          }}
        />
        <XStack gap="2">
          <YStack flex={1}>
            <AppButton
              variant="secondary"
              label={t("access.cancel")}
              onPress={onDone}
            />
          </YStack>
          <YStack flex={1}>
            <AppButton
              label={t("access.wizard.next")}
              disabled={keepPin || newPin.check.pin === null}
              onPress={() => setStep("devices")}
            />
          </YStack>
        </XStack>
      </YStack>
    )
  }

  return (
    <YStack gap="3">
      <Text fontSize="xl" fontWeight="700">
        {t("access.wizard.devices.title")}
      </Text>
      <Text color="muted-foreground">
        {t("access.wizard.devices.description")}
      </Text>
      {devices.map((device) => (
        <YStack
          key={device.id}
          gap="2"
          p="3"
          rounded="lg"
          borderWidth={1}
          borderColor="border-color"
        >
          <DeviceHeading device={device} thisDevice={device.id === deviceId} />
          {renaming?.id === device.id ? (
            <RenameForm device={device} onClose={() => setRenaming(null)} />
          ) : (
            <>
              <Text fontWeight="600">
                {t("access.device.preset", { name: device.name })}
              </Text>
              <PresetPicker
                value={presets[device.id] ?? "basic"}
                onChange={(preset) =>
                  setPresets((current) => ({ ...current, [device.id]: preset }))
                }
              />
              <AppButton
                variant="secondary"
                label={t("access.device.rename")}
                onPress={() => setRenaming(device)}
              />
            </>
          )}
        </YStack>
      ))}
      <XStack gap="2">
        <YStack flex={1}>
          <AppButton
            variant="secondary"
            label={t("access.wizard.back")}
            disabled={pending}
            onPress={() => setStep("pin")}
          />
        </YStack>
        <YStack flex={1}>
          <AppButton
            label={t("access.turnOn")}
            pending={pending}
            onPress={() => {
              void finish()
            }}
          />
        </YStack>
      </XStack>
    </YStack>
  )
}
