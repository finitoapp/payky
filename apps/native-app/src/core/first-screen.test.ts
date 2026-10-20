import { beforeEach, expect, test, vi } from "vitest"

const splash = vi.hoisted(() => ({ hidden: 0 }))
vi.mock("expo-splash-screen", () => ({
  hide: () => {
    splash.hidden += 1
  },
}))

beforeEach(() => {
  vi.resetModules()
  splash.hidden = 0
  vi.useFakeTimers()
  vi.stubGlobal("requestAnimationFrame", (callback: () => void) =>
    setTimeout(callback, 16)
  )
})

const load = () => import("./first-screen.ts")

test("waits for the gate and for a route behind its fallback, then hides once", async () => {
  const screen = await load()
  screen.routeFallbackMounted()
  screen.markGateResolved()
  vi.advanceTimersByTime(16)
  expect(splash.hidden).toBe(0)

  screen.routeFallbackUnmounted()
  expect(splash.hidden).toBe(1)

  screen.routeFallbackMounted()
  screen.routeFallbackUnmounted()
  vi.advanceTimersByTime(10_000)
  expect(splash.hidden).toBe(1)
})

test("a gate with nothing behind a fallback (the PIN screen) is ready on the next frame", async () => {
  const screen = await load()
  screen.markGateResolved()
  expect(splash.hidden).toBe(0)
  vi.advanceTimersByTime(16)
  expect(splash.hidden).toBe(1)
})

test("a route that never settles still releases the splash after the timeout", async () => {
  const screen = await load()
  screen.routeFallbackMounted()
  screen.markGateResolved()
  vi.advanceTimersByTime(9_999)
  expect(splash.hidden).toBe(0)
  vi.advanceTimersByTime(1)
  expect(splash.hidden).toBe(1)
})
