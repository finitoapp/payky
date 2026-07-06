import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { LoaderCircleIcon } from "lucide-react"
import { useEffect } from "react"

import { PhoneViewport } from "@/components/skeleton.tsx"
import { settingsQuery } from "@/core/modules/app-settings/app-settings-queries.ts"
import { useEvoluQuery } from "@/hooks/use-evolu-query.ts"
import { useTranslation } from "@/hooks/use-translation.ts"

// TODO: The timeout is a stopgap: without a sync-state API there is no way to
// tell "data not synced yet" from "account with no data". Replace it with the
// sync-state API of the next Evolu version.
const syncWaitTimeoutMs = 15_000

export const Route = createFileRoute("/restore-account")({
  component: RestoreAccountPage,
})

function RestoreAccountPage() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { data } = useEvoluQuery(settingsQuery)
  const [settings] = data
  const restored = settings !== undefined

  useEffect(() => {
    if (restored) {
      void navigate({ to: "/", replace: true })
    }
  }, [navigate, restored])

  useEffect(() => {
    if (restored) {
      return
    }

    const timeout = setTimeout(() => {
      void navigate({ to: "/onboarding", replace: true })
    }, syncWaitTimeoutMs)

    return () => {
      clearTimeout(timeout)
    }
  }, [navigate, restored])

  return (
    <main className="min-h-svh bg-background text-foreground">
      <PhoneViewport className="justify-center px-5 py-6">
        <div
          className="flex flex-col items-center gap-4 text-center"
          aria-live="polite"
        >
          <LoaderCircleIcon
            className="size-8 animate-spin text-muted-foreground"
            aria-hidden="true"
          />
          <h1 className="font-semibold text-2xl leading-tight">
            {t("accountRestore.title")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t("accountRestore.description")}
          </p>
        </div>
      </PhoneViewport>
    </main>
  )
}
