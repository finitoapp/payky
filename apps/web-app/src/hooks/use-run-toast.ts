import type { TranslationKey } from "@payky/app-shared/i18n/resources"
import { useCallback } from "react"
import { toast } from "sonner"
import { useAppRun, useCashuAppRun } from "@/hooks/use-app-run.ts"
import { useTranslation } from "@/hooks/use-translation.ts"

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
  return useRunToastWith(useAppRun())
}

/** `useRunToast` over `useCashuAppRun`, for the Cashu screens. */
export function useCashuRunToast() {
  return useRunToastWith(useCashuAppRun())
}

function useRunToastWith<Run extends AsyncDisposable>(
  appRun: () => Run | Promise<Run>
) {
  const { t } = useTranslation()

  return useCallback(
    async (
      action: (run: Run) => Promise<TranslationKey | undefined>
    ): Promise<boolean> => {
      try {
        await using run = await appRun()
        const errorKey = await action(run)
        if (errorKey !== undefined) {
          toast.error(t(errorKey))
          return false
        }
        return true
      } catch {
        toast.error(t("app.saveFailed"))
        return false
      }
    },
    [appRun, t]
  )
}
