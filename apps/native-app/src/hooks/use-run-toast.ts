import type { TranslationKey } from "@payky/app-shared/i18n/resources"
import { useCallback } from "react"
import {
  type NativeAppRun,
  type NativeCashuAppRun,
  useAppRun,
  useCashuAppRun,
} from "./use-app-run.ts"
import { useToast } from "./use-toast.ts"
import { useTranslation } from "./use-translation.ts"

/**
 * Native `useRunToast`, same protocol as the web hook: owns the
 * `await using run` scope; `action` returns a `TranslationKey` for a specific
 * failure toast or falls off the end on success; a throw or rejection (e.g.
 * `run.ok`/`run.orThrow` on failure) gets the generic `app.saveFailed` toast.
 * Resolves `true` only when `action` completed without a message.
 */
export function useRunToast() {
  return useRunToastWith<NativeAppRun>(useAppRun())
}

/** `useRunToast` over `useCashuAppRun`, for the Cashu screens. */
export function useCashuRunToast() {
  return useRunToastWith<NativeCashuAppRun>(useCashuAppRun())
}

function useRunToastWith<Run extends AsyncDisposable>(
  appRun: () => Run | Promise<Run>
) {
  const { t } = useTranslation()
  const toast = useToast()

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
    [appRun, toast, t]
  )
}
