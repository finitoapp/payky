import {
  type PinPromptRequest,
  pinPromptQueueAtom,
} from "@payky/app-shared/access-state"
import { atom, type Setter } from "jotai"
import type { SetStateAction } from "react"

// `set(atom, value)` infers its arguments from `value` alone and rejects the
// shared atom, which comes from app-shared's own copy of jotai; the explicit
// arguments pin them to the atom's.
const setQueue = (
  set: Setter,
  queue: ReadonlyArray<PinPromptRequest>
): void => {
  set<
    ReadonlyArray<PinPromptRequest>,
    [SetStateAction<ReadonlyArray<PinPromptRequest>>],
    void
  >(pinPromptQueueAtom, queue)
}

/** Settles and removes the head one-shot prompt; starts no session. */
export const settlePinPromptAtom = atom(null, (get, set, granted: boolean) => {
  const [head] = get(pinPromptQueueAtom)
  if (head === undefined) return
  setQueue(set, get(pinPromptQueueAtom).slice(1))
  head.resolve(granted)
})

/** Settles every pending prompt with `false` (unmount, account switch). */
export const clearPinPromptsAtom = atom(null, (get, set) => {
  const queue = get(pinPromptQueueAtom)
  setQueue(set, [])
  for (const request of queue) request.resolve(false)
})
