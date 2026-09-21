import { useCallback } from "react"
import { toast } from "sonner"
import { useAppRun } from "@/hooks/use-app-run.ts"
import { useTranslation } from "@/hooks/use-translation.ts"
import type { TranslationKey } from "@/i18n/resources.ts"

type AppRun = ReturnType<ReturnType<typeof useAppRun>>

/**
 * The button/form-submit counterpart to `useInlineSave`: owns the
 * `await using run = appRun()` scope and shares its failure protocol —
 * `action` returns a `TranslationKey` for a specific message; a call site
 * with no message to report can just fall off the end instead of writing
 * `return undefined` (TS accepts the implicit `undefined` either way).
 * Throwing/rejecting (e.g. `run.ok`/`run.orThrow` on failure) gets a generic
 * fallback toast so no call site has to `try`/`catch` a defect itself.
 * Resolves `true` only when `action` completed without a message.
 */
export function useRunToast() {
  const appRun = useAppRun()
  const { t } = useTranslation()

  return useCallback(
    async (
      action: (run: AppRun) => Promise<TranslationKey | undefined>
    ): Promise<boolean> => {
      try {
        await using run = appRun()
        const errorKey = await action(run)
        if (errorKey !== undefined) {
          toast.error(t(errorKey))
          return false
        }
        return true
      } catch {
        toast.error(t("settings.saveFailed"))
        return false
      }
    },
    [appRun, t]
  )
}
