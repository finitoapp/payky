import { createIdFromString } from "@evolu/common"
import {
  accessSessionAtom,
  type PinPromptRequest,
  pinPromptQueueAtom,
} from "@payky/app-shared/access-state"
import { createStore } from "jotai"
import type { SetStateAction } from "react"
import { describe, expect, test } from "vitest"
import { clearPinPromptsAtom, settlePinPromptAtom } from "./pin-prompt.ts"

const request = (id: string, resolve: (granted: boolean) => void) => ({
  id,
  permission: null,
  action: "access.pin.title" as const,
  resolve,
})

describe("pin prompt queue", () => {
  test.each([
    { cleared: false, phrase: false },
    { cleared: true, phrase: false },
    { cleared: false, phrase: true },
    { cleared: true, phrase: true },
  ])("ignores a stale result ($cleared, $phrase)", ({ cleared, phrase }) => {
    const store = createStore()
    const answers: string[] = []
    const first = request("1", (g) => answers.push(`1:${g}`))
    const second = request("2", (g) => answers.push(`2:${g}`))
    const enqueue = (queue: ReadonlyArray<PinPromptRequest>) =>
      store.set<
        ReadonlyArray<PinPromptRequest>,
        [SetStateAction<ReadonlyArray<PinPromptRequest>>],
        void
      >(pinPromptQueueAtom, queue)
    enqueue([first])
    if (cleared) store.set(clearPinPromptsAtom)
    else store.set(settlePinPromptAtom, { id: first.id, granted: false })
    enqueue([second])

    store.set(settlePinPromptAtom, {
      id: first.id,
      granted: true,
      ...(phrase
        ? { sessionAccountId: createIdFromString<"DeviceAccountId">("a") }
        : {}),
    })

    expect(answers).toEqual(["1:false"])
    expect(store.get(pinPromptQueueAtom)).toEqual([second])
    expect(store.get(accessSessionAtom)).toBeNull()
  })

  test("a current phrase unlock starts its account session and settles once", () => {
    const store = createStore()
    const answers: boolean[] = []
    const accountId = createIdFromString<"DeviceAccountId">("a")
    store.set<
      ReadonlyArray<PinPromptRequest>,
      [SetStateAction<ReadonlyArray<PinPromptRequest>>],
      void
    >(pinPromptQueueAtom, [request("1", (g) => answers.push(g))])
    const result = { id: "1", granted: true, sessionAccountId: accountId }

    store.set(settlePinPromptAtom, result)
    store.set(settlePinPromptAtom, result)

    expect(answers).toEqual([true])
    expect(store.get(pinPromptQueueAtom)).toEqual([])
    expect(store.get(accessSessionAtom)).toEqual({ accountId })
  })

  test("settles the head in order and starts no session", () => {
    const store = createStore()
    const answers: string[] = []
    store.set<
      ReadonlyArray<PinPromptRequest>,
      [SetStateAction<ReadonlyArray<PinPromptRequest>>],
      void
    >(pinPromptQueueAtom, [
      request("1", (g) => answers.push(`1:${g}`)),
      request("2", (g) => answers.push(`2:${g}`)),
    ])
    store.set(settlePinPromptAtom, { id: "1", granted: true })
    expect(answers).toEqual(["1:true"])
    expect(store.get(pinPromptQueueAtom).map((r) => r.id)).toEqual(["2"])
    expect(store.get(accessSessionAtom)).toBeNull()
    store.set(settlePinPromptAtom, { id: "2", granted: false })
    expect(answers).toEqual(["1:true", "2:false"])
  })

  test("clearing settles everything with false", () => {
    const store = createStore()
    const answers: boolean[] = []
    store.set<
      ReadonlyArray<PinPromptRequest>,
      [SetStateAction<ReadonlyArray<PinPromptRequest>>],
      void
    >(pinPromptQueueAtom, [
      request("1", (g) => answers.push(g)),
      request("2", (g) => answers.push(g)),
    ])
    store.set(clearPinPromptsAtom)
    expect(answers).toEqual([false, false])
    expect(store.get(pinPromptQueueAtom)).toEqual([])
  })
})
