import { useSetAtom } from "jotai"
import { useMemo } from "react"
import { showToastAtom } from "../atoms/toast.ts"

/** `toast.success(message)` / `toast.error(message)` with translated text. */
export function useToast() {
  const show = useSetAtom(showToastAtom)
  return useMemo(
    () => ({
      success: (message: string) => show({ variant: "success", message }),
      error: (message: string) => show({ variant: "error", message }),
    }),
    [show]
  )
}
