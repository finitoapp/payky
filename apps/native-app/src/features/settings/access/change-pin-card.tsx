import { changePin } from "@payky/core/modules/access/access-actions"
import { useState } from "react"
import { Text, XStack, YStack } from "tamagui"
import { AppButton } from "../../../components/app-button.tsx"
import { useRequirePermission } from "../../../core/use-access.ts"
import { useRunToast } from "../../../hooks/use-run-toast.ts"
import { useTranslation } from "../../../hooks/use-translation.ts"
import { NewPinFields, useNewPin } from "./new-pin-fields.tsx"

/** Replaces the owner PIN (access/0001); the PIN is never cleared. */
export function ChangePinCard({ onDone }: { readonly onDone: () => void }) {
  const { t } = useTranslation()
  const runToast = useRunToast()
  const { requirePin } = useRequirePermission()
  const newPin = useNewPin()
  const [pending, setPending] = useState(false)

  const save = async () => {
    const pin = newPin.check.pin
    if (pin === null || pending) return
    setPending(true)
    // Always the current PIN first, even on a device with `admin`
    // (access/0001): a device set to Owner by mistake must not be able to
    // lock the owner out. Awaited before the new PIN reaches the core hash.
    if (!(await requirePin("access.action.changePin"))) {
      setPending(false)
      return
    }
    const saved = await runToast(async (run) => {
      await run.ok(changePin(pin))
    })
    // The digits are done with once submitted, saved or not.
    newPin.clear()
    setPending(false)
    if (saved) onDone()
  }

  return (
    <YStack gap="3">
      <Text fontSize="xl" fontWeight="700">
        {t("access.changePin")}
      </Text>
      <NewPinFields state={newPin} disabled={pending} />
      <XStack gap="2">
        <YStack flex={1}>
          <AppButton
            variant="secondary"
            label={t("access.cancel")}
            disabled={pending}
            onPress={onDone}
          />
        </YStack>
        <YStack flex={1}>
          <AppButton
            label={t("access.save")}
            pending={pending}
            disabled={newPin.check.pin === null}
            onPress={() => {
              void save()
            }}
          />
        </YStack>
      </XStack>
    </YStack>
  )
}
