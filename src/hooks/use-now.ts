import { useEffect, useState } from "react"

import type { TimestampMs } from "@/core/modules/shared/schema.ts"

/** The earliest of `deadlines` still ahead of `nowMs`, if any. */
const earliestFutureDeadline = (
  deadlines: ReadonlyArray<TimestampMs | null>,
  nowMs: number
): TimestampMs | null => {
  let earliest: TimestampMs | null = null

  for (const deadline of deadlines) {
    if (deadline === null || deadline <= nowMs) continue
    if (earliest === null || deadline < earliest) earliest = deadline
  }

  return earliest
}

/**
 * A `Date` for render-time derivations that stop being true once a known
 * deadline passes — `derivePaymentStatus`'s `expiresAt`, and everything
 * built on it (`derivePendingPaymentIds`, the bill editing lock, the
 * payment QR screen).
 *
 * Reading `new Date()` straight in a render (or in a `useMemo` keyed only on
 * query data) freezes the clock at whatever the last unrelated re-render
 * happened to be: nothing writes a row when a payment expires, so no Evolu
 * subscription fires and the derived status stays `pending` indefinitely.
 * This schedules a single timeout for the next deadline instead and
 * re-renders once, exactly when the answer changes — no polling interval.
 *
 * Pass every deadline that matters (a payment's `expiresAt`, one per row);
 * only the earliest one still in the future is scheduled, and each tick
 * advances to the next. Deadlines already in the past, `null` entries, and
 * an empty list all schedule nothing. The array's identity doesn't matter —
 * only the reduced timestamp is used as an effect dependency — so an inline
 * array literal is fine.
 */
export function useNow(deadlines: ReadonlyArray<TimestampMs | null>): Date {
  const [now, setNow] = useState(() => new Date())
  const nextDeadline = earliestFutureDeadline(deadlines, now.getTime())

  useEffect(() => {
    if (nextDeadline === null) return

    let timer: ReturnType<typeof setTimeout> | undefined

    const tick = () => {
      // `derivePaymentStatus` compares with `>`, so the new `Date` has to
      // land strictly *after* the deadline for the status to flip.
      const delay = nextDeadline + 1 - Date.now()
      if (delay <= 0) {
        setNow(new Date())
        return
      }
      // Timers can fire marginally early, and a sleeping device can wake
      // long after the deadline — re-check rather than trusting one shot.
      timer = setTimeout(tick, delay)
    }

    tick()

    return () => {
      if (timer !== undefined) clearTimeout(timer)
    }
  }, [nextDeadline])

  return now
}
