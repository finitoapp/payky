import * as Clipboard from "expo-clipboard"
import { useCallback } from "react"
import { useToast } from "./use-toast.ts"

/**
 * Native `copyToClipboard`: copies `value` and tells the user the outcome by
 * toast. Messages arrive already translated, as in web's `lib/clipboard.ts`.
 * Never use it for the recovery phrase; those screens keep it out of the
 * clipboard on purpose.
 */
export function useCopyToClipboard() {
  const toast = useToast()
  return useCallback(
    async (
      value: string,
      messages: { readonly copied: string; readonly failed: string }
    ): Promise<void> => {
      try {
        await Clipboard.setStringAsync(value)
        toast.success(messages.copied)
      } catch {
        toast.error(messages.failed)
      }
    },
    [toast]
  )
}
