import type { Task } from "@evolu/common"
import { useCallback } from "react"
import { toast } from "sonner"
import type { EvoluOwnerIdDep } from "@/core/deps.ts"
import type { EvoluDep } from "@/core/modules/shared/evolu-deps.ts"
import { useAppRun } from "@/hooks/use-app-run.ts"
import {
  type ConfirmDialogOptions,
  useConfirmDialog,
} from "@/hooks/use-confirm-dialog.ts"
import { useTranslation } from "@/hooks/use-translation.ts"

/**
 * Confirms with the user, then runs a Task whose only realistic failure is
 * unexpected infra rather than a domain Result (AGENTS.md's Domain Action
 * Patterns: plain try/catch + generic toast for a `never`-error Task).
 * Resolves `true` only when both the confirmation and the Task succeeded, so
 * callers can gate a follow-up such as navigation on the return value.
 */
export function useConfirmedRun() {
  const confirm = useConfirmDialog()
  const appRun = useAppRun()
  const { t } = useTranslation()

  return useCallback(
    async <T>(
      options: ConfirmDialogOptions,
      task: Task<T, never, EvoluDep & EvoluOwnerIdDep>
    ): Promise<boolean> => {
      const confirmed = await confirm(options)
      if (!confirmed) return false

      try {
        await using run = appRun()
        await run(task)
        return true
      } catch {
        toast.error(t("settings.saveFailed"))
        return false
      }
    },
    [confirm, appRun, t]
  )
}
