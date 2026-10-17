import {
  accessSessionAtom,
  type PinPromptRequest,
  pinPromptQueueAtom,
} from "@payky/app-shared/access-state"
import type { DeviceAccountId } from "@payky/core/evolu/device-client"
import { atom, type ExtractAtomValue, type Setter } from "jotai"
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

/** A canceled prompt's late result must not approve the next queued action. */
export const settlePinPromptAtom = atom(
  null,
  (
    get,
    set,
    {
      id,
      granted,
      sessionAccountId,
    }: {
      readonly id: string
      readonly granted: boolean
      readonly sessionAccountId?: DeviceAccountId
    }
  ) => {
    const [head] = get(pinPromptQueueAtom)
    if (head === undefined || head.id !== id) return
    if (granted && sessionAccountId !== undefined)
      set<
        ExtractAtomValue<typeof accessSessionAtom>,
        [SetStateAction<ExtractAtomValue<typeof accessSessionAtom>>],
        void
      >(accessSessionAtom, { accountId: sessionAccountId })
    setQueue(set, get(pinPromptQueueAtom).slice(1))
    head.resolve(granted)
  }
)

/** Settles every pending prompt with `false` (unmount, account switch). */
export const clearPinPromptsAtom = atom(null, (get, set) => {
  const queue = get(pinPromptQueueAtom)
  setQueue(set, [])
  for (const request of queue) request.resolve(false)
})
