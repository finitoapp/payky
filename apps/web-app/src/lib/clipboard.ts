import { toast } from "sonner"

/**
 * Copies `value` to the clipboard and reports the outcome as a toast.
 *
 * `navigator.clipboard.writeText` rejects on a denied permission, outside a
 * secure context, and in a WebView that was never granted clipboard access,
 * so every call site has to handle failure — and none of them wants to do
 * anything beyond telling the user. Messages arrive already translated; this
 * is UI plumbing, not a place that should know translation keys.
 */
export async function copyToClipboard(
  value: string,
  messages: { readonly copied: string; readonly failed: string }
): Promise<void> {
  try {
    await navigator.clipboard.writeText(value)
    toast.success(messages.copied)
  } catch {
    toast.error(messages.failed)
  }
}
