import type { HardwareKeyEvent } from "./hardware-keys.ts"

const isTextField = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement)

/**
 * The web build's `hardware-keys.ts`: every `keydown` on `document`, in the capture
 * phase so no handler that stops propagation can hide a key. A key held with
 * Ctrl, Alt or Meta, or composed by an IME, is a shortcut rather than typing
 * and arrives as `Unidentified`, which breaks a scan burst as web-app's
 * scanner does. Nothing is swallowed here: the scanner and the keypad tell a
 * scan from typing by the same timing on both platforms.
 */
export function addHardwareKeyListener(
  listener: (event: HardwareKeyEvent) => void
): () => void {
  const handleKeydown = (event: KeyboardEvent) =>
    listener({
      key:
        event.ctrlKey || event.altKey || event.metaKey || event.isComposing
          ? "Unidentified"
          : event.key,
      timeStamp: event.timeStamp,
      inTextField: isTextField(event.target),
      preventDefault: () => event.preventDefault(),
    })

  document.addEventListener("keydown", handleKeydown, { capture: true })
  return () =>
    document.removeEventListener("keydown", handleKeydown, { capture: true })
}
