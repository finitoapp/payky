import * as SplashScreen from "expo-splash-screen"
import { useSyncExternalStore } from "react"

/**
 * When the first screen is really on: `AccessGate` has resolved (account,
 * databases, access rules) and no route is still behind its Suspense
 * fallback, the root layout's `SuspenseFallback`. Then the native splash,
 * which the root layout holds, hides straight onto that screen rather than
 * onto an empty background, and the background jobs may start: before it,
 * their key derivations and the Spark SDK's start held the first screen up.
 *
 * Module state, as the splash it drives is once per process: an account
 * switch or an error-screen retry does not show it again.
 */

/** A first screen that never settles still gets the splash out of the way. */
const SAFETY_TIMEOUT_MS = 10_000

let gateResolved = false
let routesWaiting = 0
let ready = false
const listeners = new Set<() => void>()

const settle = () => {
  if (ready || !gateResolved || routesWaiting > 0) return
  ready = true
  SplashScreen.hide()
  for (const listener of listeners) listener()
}

/** `AccessGate` has what it needs; its route, or the PIN screen, is rendering. */
export const markGateResolved = (): void => {
  if (gateResolved) return
  gateResolved = true
  // A route that suspended in this same commit mounts its fallback in this
  // commit's effects, so it is counted by the next frame.
  requestAnimationFrame(settle)
  setTimeout(markFirstScreenReady, SAFETY_TIMEOUT_MS)
}

/** The root layout's route `SuspenseFallback` mounted. */
export const routeFallbackMounted = (): void => {
  routesWaiting += 1
}

/** The route behind that fallback rendered. */
export const routeFallbackUnmounted = (): void => {
  routesWaiting -= 1
  settle()
}

/** Ready now, whatever is still pending: the error screen, the timeout. */
export const markFirstScreenReady = (): void => {
  gateResolved = true
  routesWaiting = 0
  settle()
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export const useFirstScreenReady = (): boolean =>
  useSyncExternalStore(subscribe, () => ready)
