import { useSyncExternalStore } from "react"

/** Chromium's install offer; not in the DOM typings. */
export interface BeforeInstallPromptEvent extends Event {
  readonly prompt: () => Promise<void>
}

declare global {
  interface Window {
    /** Kept by the inline script in `landing.html` until it is used. */
    paykyInstallPrompt?: BeforeInstallPromptEvent
  }
  interface WindowEventMap {
    readonly appinstalled: Event
  }
}

const promptUsedEvent = "paykyinstallpromptused"
const changeEvents = [
  "beforeinstallprompt",
  "appinstalled",
  promptUsedEvent,
] as const

function subscribe(onChange: () => void): () => void {
  for (const type of changeEvents) addEventListener(type, onChange)
  return () => {
    for (const type of changeEvents) removeEventListener(type, onChange)
  }
}

/**
 * The browser's pending offer to install the app, or `null` where there is
 * none: on the server, in Safari and Firefox, once the app is installed, and
 * once the offer has been shown. `null` while hydrating, so the prerendered
 * page and the first render agree (landing/0002).
 */
export const useInstallPrompt = (): BeforeInstallPromptEvent | null =>
  useSyncExternalStore(
    subscribe,
    () => window.paykyInstallPrompt ?? null,
    () => null
  )

/** Shows the browser's install dialog; an offer can be shown only once. */
export async function promptInstall(
  installPrompt: BeforeInstallPromptEvent
): Promise<void> {
  window.paykyInstallPrompt = undefined
  dispatchEvent(new Event(promptUsedEvent))
  await installPrompt.prompt()
}
