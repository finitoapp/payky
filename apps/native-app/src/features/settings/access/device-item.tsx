import { presetOf, withPermission } from "@payky/app-shared/access-form"
import {
  accessPresets,
  type Permission,
  permissions,
} from "@payky/core/modules/access/access-types"
import { decodePermissions } from "@payky/core/modules/access/access-utils"
import {
  removeDevice,
  setDeviceDefaultPermissions,
  unblockDevice,
} from "@payky/core/modules/device/device-actions"
import type { DeviceListRow } from "@payky/core/modules/device/device-queries"
import TriangleAlert from "lucide-react-native/icons/triangle-alert"
import { useState } from "react"
import { Switch } from "react-native"
import { Text, XStack, YStack } from "tamagui"
import { Button } from "../../../components/ui/button.tsx"
import { Icon } from "../../../components/ui/icon.tsx"
import {
  accessPresetLabelKeys,
  permissionDescriptionKeys,
  permissionLabelKeys,
} from "../../../core/access-labels.ts"
import { useRequirePermission } from "../../../core/use-access.ts"
import { useConfirm } from "../../../hooks/use-confirm.ts"
import { useRunToast } from "../../../hooks/use-run-toast.ts"
import { useTranslation } from "../../../hooks/use-translation.ts"
import { DeviceHeading, PresetPicker, RenameForm } from "./device-parts.tsx"

/** One device of the account: its defaults, name, and removal (access/0004). */
export function DeviceItem({
  device,
  thisDevice,
}: {
  readonly device: DeviceListRow
  readonly thisDevice: boolean
}) {
  const { t } = useTranslation()
  const runToast = useRunToast()
  const confirm = useConfirm()
  const { requirePin } = useRequirePermission()
  const [editor, setEditor] = useState<"permissions" | "rename" | null>(null)
  const granted = decodePermissions(device.defaultPermissions)
  const preset = presetOf(granted)

  // The current PIN even on a device with `admin` (access/0001), awaited
  // before the Task writes the fresh token (access/0006).
  const unblock = async () => {
    if (!(await requirePin("access.action.unblock"))) return
    await runToast(async (run) => {
      await run.ok(unblockDevice(device.id))
    })
  }

  // As web: a confirmation, not the PIN. The route is `admin` already, and
  // removing a row clears its permissions together with the delete.
  const remove = async () => {
    const confirmed = await confirm({
      title: t("access.device.remove.title", { name: device.name }),
      description: t("access.device.remove.description"),
      confirmLabel: t("access.device.remove.confirm"),
      cancelLabel: t("access.cancel"),
      variant: "destructive",
    })
    if (!confirmed) return
    await runToast(async (run) => {
      await run.ok(removeDevice(device.id))
    })
  }

  return (
    <YStack
      gap="3"
      p="3"
      rounded="lg"
      borderWidth={1}
      borderColor="border-color"
    >
      <DeviceHeading device={device} thisDevice={thisDevice} />
      <Text color="muted-foreground">
        {preset === null
          ? permissions
              .filter((permission) => granted.has(permission))
              .map((permission) => t(permissionLabelKeys[permission]))
              .join(", ")
          : t(accessPresetLabelKeys[preset])}
      </Text>
      {editor === "permissions" ? (
        <PermissionsEditor
          device={device}
          initial={granted}
          onClose={() => setEditor(null)}
        />
      ) : editor === "rename" ? (
        <RenameForm device={device} onClose={() => setEditor(null)} />
      ) : (
        <YStack gap="2">
          <Button
            size="sm"
            variant="outline"
            label={t("access.device.permissions")}
            onPress={() => setEditor("permissions")}
          />
          <Button
            size="sm"
            variant="outline"
            label={t("access.device.rename")}
            onPress={() => setEditor("rename")}
          />
          {device.pinBlockedAt !== null && !thisDevice ? (
            <Button
              size="sm"
              variant="outline"
              label={t("access.device.unblock")}
              onPress={() => {
                void unblock()
              }}
            />
          ) : null}
          {thisDevice ? null : (
            <Button
              size="sm"
              variant="destructive"
              label={t("access.device.remove")}
              onPress={() => {
                void remove()
              }}
            />
          )}
        </YStack>
      )}
    </YStack>
  )
}

/** A device's default permissions: a preset to start from, then each one. */
function PermissionsEditor({
  device,
  initial,
  onClose,
}: {
  readonly device: DeviceListRow
  readonly initial: ReadonlySet<Permission>
  readonly onClose: () => void
}) {
  const { t } = useTranslation()
  const runToast = useRunToast()
  const [granted, setGranted] = useState<ReadonlySet<Permission>>(initial)
  const [pending, setPending] = useState(false)

  const save = async () => {
    setPending(true)
    const saved = await runToast(async (run) => {
      await run.ok(
        setDeviceDefaultPermissions({ id: device.id, permissions: granted })
      )
    })
    setPending(false)
    if (saved) onClose()
  }

  return (
    <YStack gap="3">
      <Text color="muted-foreground">
        {t("access.device.permissions.description")}
      </Text>
      <Text fontWeight="600">
        {t("access.device.preset", { name: device.name })}
      </Text>
      <PresetPicker
        label={t("access.device.preset", { name: device.name })}
        value={presetOf(granted)}
        onChange={(preset) => setGranted(new Set(accessPresets[preset]))}
      />
      {permissions.map((permission) => (
        <XStack key={permission} gap="3" items="center">
          <Switch
            accessibilityLabel={t(permissionLabelKeys[permission])}
            value={granted.has(permission)}
            disabled={pending}
            onValueChange={(checked) =>
              setGranted((current) =>
                withPermission(current, permission, checked)
              )
            }
          />
          <YStack flex={1}>
            <Text fontWeight="600">{t(permissionLabelKeys[permission])}</Text>
            <Text fontSize={13} color="muted-foreground">
              {t(permissionDescriptionKeys[permission])}
            </Text>
          </YStack>
        </XStack>
      ))}
      {granted.has("admin") ? (
        <XStack
          gap={8}
          rounded={6.8}
          borderWidth={1}
          borderColor="destructive-40"
          bg="destructive-5"
          p={12}
          accessibilityRole="alert"
        >
          <YStack pt={2}>
            <Icon icon={TriangleAlert} color="destructive" />
          </YStack>
          <Text flex={1} fontSize={14}>
            {t("access.device.adminWarning")}
          </Text>
        </XStack>
      ) : null}
      <XStack gap="2">
        <YStack flex={1}>
          <Button
            size="lg"
            variant="ghost"
            label={t("access.cancel")}
            disabled={pending}
            onPress={onClose}
          />
        </YStack>
        <YStack flex={1}>
          <Button
            size="lg"
            label={t("access.save")}
            pending={pending}
            onPress={() => {
              void save()
            }}
          />
        </YStack>
      </XStack>
    </YStack>
  )
}
