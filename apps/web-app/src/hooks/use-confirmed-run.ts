import type { Task } from "@evolu/common"
import type { EvoluOwnerDep } from "@payky/core/deps"
import type { EvoluDep } from "@payky/core/modules/shared/evolu-deps"
import { useCallback } from "react"
import {
  type ConfirmDialogOptions,
  useConfirmDialog,
} from "@/hooks/use-confirm-dialog.ts"
import { useRunToast } from "@/hooks/use-run-toast.ts"

/**
 * Confirms with the user, then runs a Task whose only realistic failure is
 * unexpected infra rather than a domain Result — `useRunToast` supplies the
 * generic toast for that. Resolves `true` only when both the confirmation
 * and the Task succeeded, so callers can gate a follow-up such as
 * navigation on the return value.
 */
export function useConfirmedRun() {
  const confirm = useConfirmDialog()
  const runToast = useRunToast()

  return useCallback(
    async <T>(
      options: ConfirmDialogOptions,
      task: Task<T, never, EvoluDep & EvoluOwnerDep>
    ): Promise<boolean> => {
      const confirmed = await confirm(options)
      if (!confirmed) return false

      return runToast(async (run) => {
        await run.ok(task)
      })
    },
    [confirm, runToast]
  )
}
