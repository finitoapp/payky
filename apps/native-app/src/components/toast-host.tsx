import { useAtomValue, useSetAtom } from "jotai"
import { useEffect } from "react"
import { Text, YStack } from "tamagui"
import { dismissToastAtom, type Toast, toastsAtom } from "../atoms/toast.ts"

const DISMISS_AFTER_MS = 4000

function ToastItem({ toast }: { readonly toast: Toast }) {
  const dismiss = useSetAtom(dismissToastAtom)
  useEffect(() => {
    const timer = setTimeout(() => dismiss(toast.id), DISMISS_AFTER_MS)
    return () => clearTimeout(timer)
  }, [dismiss, toast.id])

  return (
    <YStack
      bg={toast.variant === "error" ? "red-600" : "green-600"}
      rounded="4"
      p="3"
      minH={48}
      justify="center"
      accessibilityRole="alert"
      accessibilityLiveRegion="assertive"
      onPress={() => dismiss(toast.id)}
    >
      <Text color="white">{toast.message}</Text>
    </YStack>
  )
}

/** Mount once inside the Jotai Provider and TamaguiProvider. */
export function ToastHost() {
  const toasts = useAtomValue(toastsAtom)
  return (
    <YStack
      position="absolute"
      b={24}
      l={16}
      r={16}
      gap="2"
      pointerEvents="box-none"
    >
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} />
      ))}
    </YStack>
  )
}
