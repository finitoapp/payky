import { useAtomValue, useSetAtom } from "jotai"
import { useEffect } from "react"
import { YStack } from "tamagui"
import {
  dismissToastAtom,
  type Toast as ToastData,
  toastsAtom,
} from "../../atoms/toast.ts"
import { Toast } from "../ui/toast.tsx"

const DISMISS_AFTER_MS = 4000

function ToastItem({ toast }: { readonly toast: ToastData }) {
  const dismiss = useSetAtom(dismissToastAtom)
  useEffect(() => {
    const timer = setTimeout(() => dismiss(toast.id), DISMISS_AFTER_MS)
    return () => clearTimeout(timer)
  }, [dismiss, toast.id])

  return (
    <Toast
      variant={toast.variant}
      message={toast.message}
      onPress={() => dismiss(toast.id)}
      action={
        toast.action === undefined
          ? undefined
          : {
              label: toast.action.label,
              onPress: () => {
                dismiss(toast.id)
                toast.action?.onPress()
              },
            }
      }
    />
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
