import {
  type PinPromptRequest,
  pinPromptQueueAtom,
} from "@payky/app-shared/access-state"
import type { DeviceAccountId } from "@payky/core/evolu/device-client"
import { useAtomValue, useSetAtom } from "jotai"
import { Suspense, useEffect } from "react"
import { Modal, ScrollView } from "react-native"
import { Text, YStack } from "tamagui"
import { evoluCounterAtom } from "../atoms/evolu-counter.ts"
import {
  clearPinPromptsAtom,
  settlePinPromptAtom,
} from "../atoms/pin-prompt.ts"
import {
  sessionAfterPromptUnlock,
  type UnlockedVia,
} from "../core/access-session.ts"
import { useAccess } from "../core/use-access.ts"
import { PinScreen } from "./pin-screen.tsx"

/**
 * Renders the one-shot PIN prompt driven by `pinPromptQueueAtom`
 * (access/0002): it answers the one action at the head of the queue and
 * starts no session, except the recovery phrase (access/0006). Back and
 * cancel answer `false`; mount once inside the providers.
 */
export function PinPromptHost() {
  const head = useAtomValue(pinPromptQueueAtom)[0]
  const settle = useSetAtom(settlePinPromptAtom)
  const clear = useSetAtom(clearPinPromptsAtom)
  const accountVersion = useAtomValue(evoluCounterAtom)

  // Pending prompts belong to the account that asked: answer them with false
  // on an account switch (counter bump) and on unmount.
  // biome-ignore lint/correctness/useExhaustiveDependencies: accountVersion is the trigger
  useEffect(() => clear, [accountVersion, clear])

  return (
    <Modal
      visible={head !== undefined}
      transparent
      animationType="fade"
      onRequestClose={() => {
        if (head !== undefined) settle({ id: head.id, granted: false })
      }}
    >
      <YStack flex={1} justify="center" p="4" bg="rgba(0,0,0,0.5)">
        {head === undefined ? null : (
          <YStack
            bg="card"
            rounded="6"
            p="4"
            maxH="100%"
            accessibilityViewIsModal
          >
            <ScrollView keyboardShouldPersistTaps="handled">
              <Suspense fallback={null}>
                <PinPrompt
                  key={head.id}
                  request={head}
                  onSettled={(granted, sessionAccountId) =>
                    settle({ id: head.id, granted, sessionAccountId })
                  }
                />
              </Suspense>
            </ScrollView>
          </YStack>
        )}
      </YStack>
    </Modal>
  )
}

function PinPrompt({
  request,
  onSettled,
}: {
  readonly request: PinPromptRequest
  readonly onSettled: (
    granted: boolean,
    sessionAccountId?: DeviceAccountId
  ) => void
}) {
  const { accountId } = useAccess()

  const unlocked = (via: UnlockedVia) => {
    const session = sessionAfterPromptUnlock(via, accountId)
    onSettled(true, session?.accountId)
  }

  return (
    <YStack gap="3">
      {request.detail === undefined ? null : (
        <Text fontWeight="600" text="center" accessibilityRole="summary">
          {request.detail}
        </Text>
      )}
      <PinScreen
        permission={request.permission}
        action={request.action}
        target={request.action}
        onUnlocked={unlocked}
        onCancel={() => onSettled(false)}
      />
    </YStack>
  )
}
