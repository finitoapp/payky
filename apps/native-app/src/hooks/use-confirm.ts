import { useSetAtom } from "jotai"
import { type ConfirmRequest, enqueueConfirmAtom } from "../atoms/confirm.ts"

export type ConfirmOptions = Omit<ConfirmRequest, "resolve">

/** Enqueues a confirmation; resolves `true`/`false` once the user answers. */
export function useConfirm(): (options: ConfirmOptions) => Promise<boolean> {
  return useSetAtom(enqueueConfirmAtom)
}
