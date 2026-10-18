import type { Task } from "@evolu/common"
import type { EvoluOwnerDep } from "@payky/core/deps"
import type { EvoluDep } from "@payky/core/modules/shared/evolu-deps"
import { useCallback } from "react"
import { type ConfirmOptions, useConfirm } from "./use-confirm.ts"
import { useRunToast } from "./use-run-toast.ts"

/**
 * Native `useConfirmedRun`, as web's: confirms with the user, then runs a Task
 * whose only realistic failure is unexpected infra rather than a domain
 * `Result` (`useRunToast` supplies the generic toast for that). Resolves
 * `true` only when both the confirmation and the Task succeeded, so a caller
 * can gate navigation on it.
 */
export function useConfirmedRun() {
  const confirm = useConfirm()
  const runToast = useRunToast()

  return useCallback(
    async <T>(
      options: ConfirmOptions,
      task: Task<T, never, EvoluDep & EvoluOwnerDep>
    ): Promise<boolean> => {
      if (!(await confirm(options))) return false
      return runToast(async (run) => {
        await run.ok(task)
      })
    },
    [confirm, runToast]
  )
}
