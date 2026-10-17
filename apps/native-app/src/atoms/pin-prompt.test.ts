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
    store.set(settlePinPromptAtom, true)
    expect(answers).toEqual(["1:true"])
    expect(store.get(pinPromptQueueAtom).map((r) => r.id)).toEqual(["2"])
    expect(store.get(accessSessionAtom)).toBeNull()
    store.set(settlePinPromptAtom, false)
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
