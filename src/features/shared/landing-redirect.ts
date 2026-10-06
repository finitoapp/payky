import { Capacitor } from "@capacitor/core"

// Presence alone is the marker, so there is no value to decode.
const appEnteredStorageKey = "payky.appEntered"

export interface LandingRedirectEnvironment {
  readonly nativePlatform: boolean
  readonly installedPwa: boolean
  readonly appEntered: boolean
}

/**
 * Whether a device with no account goes to the landing page rather than to
 * onboarding (landing/0001): only a browser tab that has never opened the
 * app does.
 */
export const shouldRedirectToLanding = ({
  nativePlatform,
  installedPwa,
  appEntered,
}: LandingRedirectEnvironment): boolean =>
  !nativePlatform && !installedPwa && !appEntered

export function readLandingRedirectEnvironment(): LandingRedirectEnvironment {
  return {
    nativePlatform: Capacitor.isNativePlatform(),
    installedPwa:
      window.matchMedia("(display-mode: standalone)").matches ||
      // iOS Safari's home-screen apps report themselves only through this.
      ("standalone" in navigator && navigator.standalone === true),
    appEntered: readAppEntered(),
  }
}

function readAppEntered(): boolean {
  try {
    return localStorage.getItem(appEnteredStorageKey) !== null
  } catch {
    // Storage blocked: the visitor sees the landing page again, nothing worse.
    return false
  }
}

export function markAppEntered(): void {
  try {
    localStorage.setItem(appEnteredStorageKey, "1")
  } catch {
    // Same as above.
  }
}
