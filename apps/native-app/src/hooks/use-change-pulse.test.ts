import { beforeEach, expect, test, vi } from "vitest"

/**
 * No React renderer runs in this suite, so `react` is a one-component hook
 * runner (state and refs by call order, layout effects on every render) and
 * `Animated` records what would have been drawn and started.
 */
const fake = vi.hoisted(() => ({
  slots: [] as Array<unknown>,
  index: 0,
  reduceMotion: false,
  timings: [] as Array<{
    readonly toValue: number
    readonly duration: number
    readonly from: number
  }>,
}))

vi.mock("react", () => {
  const slot = <T>(create: () => T): T => {
    const index = fake.index
    fake.index += 1
    if (!(index in fake.slots)) fake.slots[index] = create()
    return fake.slots[index] as T
  }
  return {
    useState: <T>(init: () => T) => [slot(init)],
    useRef: <T>(current: T) => slot(() => ({ current })),
    useLayoutEffect: (effect: () => void) => effect(),
  }
})

vi.mock("react-native", () => {
  class Value {
    value: number
    constructor(value: number) {
      this.value = value
    }
    setValue(value: number) {
      this.value = value
    }
    stopAnimation() {}
    interpolate(config: unknown) {
      return config
    }
  }
  return {
    Animated: {
      Value,
      timing: (
        value: Value,
        config: { readonly toValue: number; readonly duration: number }
      ) => ({
        start: () => {
          fake.timings.push({
            toValue: config.toValue,
            duration: config.duration,
            from: value.value,
          })
        },
      }),
    },
    Easing: { out: (easing: unknown) => easing, quad: () => 0 },
  }
})

vi.mock("../platform/reduce-motion.ts", () => ({
  isReduceMotionEnabled: () => fake.reduceMotion,
}))

const { useChangePulse } = await import("./use-change-pulse.ts")

const render = (value: string | number) => {
  fake.index = 0
  return useChangePulse(value)
}

beforeEach(() => {
  fake.slots = []
  fake.reduceMotion = false
  fake.timings = []
})

test("skips the first render and a re-render with the same value", () => {
  const style = render(1)
  render(1)
  expect(fake.timings).toEqual([])
  expect(render(1)).toBe(style)
})

test("replays from 0 when the value changes", () => {
  render(1)
  render(2)
  render(2)
  render("2")
  expect(fake.timings).toEqual([
    { toValue: 1, duration: 320, from: 0 },
    { toValue: 1, duration: 320, from: 0 },
  ])
})

test("stays still under reduced motion", () => {
  render(1)
  fake.reduceMotion = true
  render(2)
  expect(fake.timings).toEqual([])
  fake.reduceMotion = false
  render(2)
  expect(fake.timings).toEqual([])
})
