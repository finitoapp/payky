import { createStore } from "jotai"
import { describe, expect, test } from "vitest"
import {
  clearConfirmsAtom,
  confirmQueueAtom,
  enqueueConfirmAtom,
  settleConfirmAtom,
} from "./confirm.ts"

const options = {
  title: "t",
  description: "d",
  confirmLabel: "ok",
  cancelLabel: "no",
}

describe("confirm queue", () => {
  test("settles requests in order", async () => {
    const store = createStore()
    const first = store.set(enqueueConfirmAtom, options)
    const second = store.set(enqueueConfirmAtom, options)
    store.set(settleConfirmAtom, true)
    store.set(settleConfirmAtom, false)
    expect(await first).toBe(true)
    expect(await second).toBe(false)
    expect(store.get(confirmQueueAtom)).toEqual([])
  })

  test("clearing settles every pending request with false", async () => {
    const store = createStore()
    const pending = [
      store.set(enqueueConfirmAtom, options),
      store.set(enqueueConfirmAtom, options),
    ]
    store.set(clearConfirmsAtom)
    expect(await Promise.all(pending)).toEqual([false, false])
    expect(store.get(confirmQueueAtom)).toEqual([])
  })
})
