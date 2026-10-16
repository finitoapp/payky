import { useAtomValue, useSetAtom } from "jotai"
import { useCallback } from "react"
import {
  type ConfirmDialogRequest,
  confirmDialogQueueAtom,
} from "@/atoms/confirm-dialog.ts"

export type ConfirmDialogOptions = Omit<ConfirmDialogRequest, "resolve">

/**
 * Enqueues a request for the global confirmation dialog; resolves
 * `true`/`false` once the user answers. Concurrent calls queue instead of
 * overwriting each other, so an earlier caller's Promise always settles.
 */
export function useConfirmDialog() {
  const setQueue = useSetAtom(confirmDialogQueueAtom)
  return useCallback(
    (options: ConfirmDialogOptions) =>
      new Promise<boolean>((resolve) => {
        setQueue((queue) => [...queue, { ...options, resolve }])
      }),
    [setQueue]
  )
}

export function useIsConfirmDialogOpen() {
  return useAtomValue(confirmDialogQueueAtom).length > 0
}
