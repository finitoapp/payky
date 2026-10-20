import { accessPresetOrder } from "@payky/app-shared/access-form"
import type { AccessPreset } from "@payky/core/modules/access/access-types"
import { renameDevice } from "@payky/core/modules/device/device-actions"
import type { DeviceListRow } from "@payky/core/modules/device/device-queries"
import { NonEmptyString255Schema } from "@payky/core/modules/shared/schema"
import Ban from "lucide-react-native/icons/ban"
import { useState } from "react"
import { Text, XStack, YStack } from "tamagui"
import { Badge } from "../../../components/ui/badge.tsx"
import { Button } from "../../../components/ui/button.tsx"
import { Field, FieldLabel } from "../../../components/ui/field.tsx"
import { Input } from "../../../components/ui/input.tsx"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../components/ui/select.tsx"
import { accessPresetLabelKeys } from "../../../core/access-labels.ts"
import { useRunToast } from "../../../hooks/use-run-toast.ts"
import { useTranslation } from "../../../hooks/use-translation.ts"

/** Name, "this device", blocked, and what kind of device it is (access/0004). */
export function DeviceHeading({
  device,
  thisDevice,
}: {
  readonly device: DeviceListRow
  readonly thisDevice: boolean
}) {
  const { t } = useTranslation()
  const details = [device.deviceType, device.browserName, device.osName]
    .filter((value) => value !== null)
    .join(" · ")

  return (
    <YStack gap="1">
      <XStack gap="2" items="center" flexWrap="wrap">
        <Text fontWeight="600">{device.name}</Text>
        {thisDevice ? (
          <Badge variant="secondary" label={t("access.device.this")} />
        ) : null}
        {device.pinBlockedAt !== null ? (
          <Badge
            variant="destructive"
            icon={Ban}
            label={t("access.device.blocked")}
          />
        ) : null}
      </XStack>
      {details === "" ? null : (
        <Text fontSize={13} color="muted-foreground">
          {details}
        </Text>
      )}
    </YStack>
  )
}

/**
 * The presets offered for a device. A hand-edited set equals none of them: it
 * is shown as "Custom" and picking a preset replaces it (access/0004).
 */
export function PresetPicker({
  label,
  value,
  onChange,
}: {
  /** Already translated: whose permissions these are. */
  readonly label: string
  readonly value: AccessPreset | null
  readonly onChange: (preset: AccessPreset) => void
}) {
  const { t } = useTranslation()
  const options = accessPresetOrder.map((preset) => ({
    value: preset as AccessPreset | "custom",
    title: t(accessPresetLabelKeys[preset]),
  }))
  if (value === null) {
    options.push({ value: "custom", title: t("access.preset.custom") })
  }

  return (
    <Select
      value={value ?? "custom"}
      onValueChange={(preset) => {
        if (preset !== "custom") onChange(preset)
      }}
      items={Object.fromEntries(
        options.map((option) => [option.value, option.title])
      )}
    >
      <SelectTrigger fullWidth aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent title={label}>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.title}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/** Renames a device (synced, access/0004), inline in its row. */
export function RenameForm({
  device,
  onClose,
}: {
  readonly device: DeviceListRow
  readonly onClose: () => void
}) {
  const { t } = useTranslation()
  const runToast = useRunToast()
  const [name, setName] = useState<string>(device.name)
  const [pending, setPending] = useState(false)
  const parsed = NonEmptyString255Schema.safeParse(name.trim())

  const save = async () => {
    if (!parsed.success) return
    setPending(true)
    const saved = await runToast(async (run) => {
      await run.ok(renameDevice({ id: device.id, name: parsed.data }))
    })
    setPending(false)
    if (saved) onClose()
  }

  return (
    <YStack gap="3">
      <Field>
        <FieldLabel>{t("access.device.name")}</FieldLabel>
        <Input
          value={name}
          maxLength={255}
          disabled={pending}
          onChangeText={setName}
          onSubmitEditing={() => void save()}
        />
      </Field>
      <XStack justify="flex-end" gap={8}>
        <Button
          variant="ghost"
          label={t("access.cancel")}
          disabled={pending}
          onPress={onClose}
        />
        <Button
          label={t("access.save")}
          pending={pending}
          disabled={!parsed.success}
          onPress={() => void save()}
        />
      </XStack>
    </YStack>
  )
}
