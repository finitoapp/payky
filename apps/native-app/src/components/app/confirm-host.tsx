import { useAtomValue, useSetAtom } from "jotai"
import { useEffect } from "react"
import { Modal } from "react-native"
import { Text, YStack } from "tamagui"
import {
  clearConfirmsAtom,
  confirmQueueAtom,
  settleConfirmAtom,
} from "../../atoms/confirm.ts"
import { evoluCounterAtom } from "../../atoms/evolu-counter.ts"
import { AppButton } from "../app-button.tsx"

/** Shows the head of the queue; mount once inside the providers. */
export function ConfirmHost() {
  const head = useAtomValue(confirmQueueAtom)[0]
  const settle = useSetAtom(settleConfirmAtom)
  const clear = useSetAtom(clearConfirmsAtom)
  const accountVersion = useAtomValue(evoluCounterAtom)

  // Pending requests belong to the account that asked: settle them with false
  // on an account switch (counter bump) and on unmount.
  // biome-ignore lint/correctness/useExhaustiveDependencies: accountVersion is the trigger
  useEffect(() => clear, [accountVersion, clear])

  return (
    <Modal
      visible={head !== undefined}
      transparent
      animationType="fade"
      onRequestClose={() => settle(false)}
    >
      <YStack flex={1} justify="center" p="4" bg="rgba(0,0,0,0.5)">
        {head === undefined ? null : (
          <YStack bg="card" rounded="6" p="4" gap="3" accessibilityViewIsModal>
            <Text fontSize="lg" fontWeight="700" accessibilityRole="header">
              {head.title}
            </Text>
            <Text>{head.description}</Text>
            <AppButton
              label={head.confirmLabel}
              variant={
                head.variant === "destructive" ? "destructive" : "primary"
              }
              onPress={() => settle(true)}
            />
            <AppButton
              label={head.cancelLabel}
              variant="secondary"
              onPress={() => settle(false)}
            />
          </YStack>
        )}
      </YStack>
    </Modal>
  )
}
