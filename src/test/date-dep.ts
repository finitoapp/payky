import type { DateDep } from "@/core/deps.ts"

/**
 * The instant every test clock starts at unless it asks for another. Nine test
 * files had independently settled on it before this helper existed.
 */
export const testFixedDate = new Date("2026-06-05T12:00:00.000Z")

export interface TestDateDep extends DateDep {
  /**
   * Moves the clock forward. Fixed clocks are the common case, but without a
   * way to advance one, a test that needs to drive the same code across two
   * different "now"s — a sync job's second run, an expiry crossing — has to
   * reinvent the dep, which is why none did.
   */
  readonly advance: (milliseconds: number) => void
}

export const createTestDateDep = (
  initial: Date = testFixedDate
): TestDateDep => {
  // Widened on purpose: `Date#getTime` is branded `TimestampMs` here, and
  // adding to a branded number yields a plain one.
  let currentTime: number = initial.getTime()

  return {
    date: {
      now: () => new Date(currentTime),
    },
    advance: (milliseconds) => {
      currentTime += milliseconds
    },
  }
}
