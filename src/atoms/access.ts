import { atom } from "jotai"

import type { AccountId } from "@/core/evolu/device-client.ts"
import type { Permission } from "@/core/modules/access/access-types.ts"
import type { TranslationKey } from "@/i18n/resources.ts"

/**
 * The PIN session (access/0005): memory only, never persisted. Tied to the
 * account it was entered for, so switching account ends it.
 */
export const accessSessionAtom = atom<{
  readonly accountId: AccountId
} | null>(null)

/**
 * When the operator last touched the app. Its own atom, read with
 * `store.get` by the idle check, so a tap re-renders nothing.
 */
export const accessLastActivityAtom = atom(0)

export interface PinPromptRequest {
  readonly id: string
  /** The permission the action needs, or `null` for an action that always asks. */
  readonly permission: Permission | null
  /** What is being attempted, shown on the prompt and logged on a wrong PIN. */
  readonly action: TranslationKey
  /** What exactly the PIN approves, already translated (an amount and where it goes). */
  readonly detail?: string
  readonly resolve: (granted: boolean) => void
}

/**
 * FIFO queue of one-shot PIN prompts, like `confirmDialogQueueAtom`: only
 * `useRequirePermission` enqueues and only `PinPromptHost` settles and
 * dequeues.
 */
export const pinPromptQueueAtom = atom<ReadonlyArray<PinPromptRequest>>([])
