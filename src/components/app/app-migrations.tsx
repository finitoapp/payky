import { LoaderCircleIcon } from "lucide-react"
import { type ReactNode, useEffect, useRef, useState } from "react"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog.tsx"
import { buttonVariants } from "@/components/ui/button.tsx"
import {
  appMigrations,
  loadPendingMigrations,
  runMigrations,
} from "@/core/migrations/migrations.ts"
import { useAppRun } from "@/hooks/use-app-run.ts"
import { useConsole } from "@/hooks/use-console.ts"
import { useTranslation } from "@/hooks/use-translation.ts"

type MigrationState =
  /** Asking each migration whether it has work; children stay unmounted. */
  | { readonly status: "checking" }
  | { readonly status: "running" }
  | { readonly status: "finished"; readonly migrated: number }
  | { readonly status: "failed" }

/**
 * Runs the pending data migrations before the rest of the app starts, and
 * reports on them in a modal the user dismisses.
 *
 * `children` — the background jobs — mount only once migrations have settled,
 * so a job never reads a half-migrated database. A failure still lets them
 * start: a migration that cannot finish should not also cost the install its
 * sync, and the dialog is what tells the user something went wrong.
 *
 * Nothing renders while checking, which is the path every ordinary start
 * takes; the dialog appears only when there was actually something to
 * migrate. Failures go to the console rather than Sentry — this is a handled
 * failure with its own UI, and `captureReportedError` has exactly two
 * sanctioned call sites.
 */
export function AppMigrations({ children }: { readonly children: ReactNode }) {
  const appRun = useAppRun()
  const console = useConsole()
  const { t } = useTranslation()
  const [state, setState] = useState<MigrationState>({ status: "checking" })
  const [dismissed, setDismissed] = useState(false)
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true

    void (async () => {
      try {
        await using run = appRun()

        const pending = await run.ok(loadPendingMigrations(appMigrations))
        if (pending.length === 0) {
          setState({ status: "finished", migrated: 0 })
          return
        }

        console.info("Running data migrations.", {
          names: pending.map((migration) => migration.name),
        })
        setState({ status: "running" })
        const migrated = await run.ok(runMigrations(pending))
        setState({ status: "finished", migrated })
      } catch (error) {
        console.error("Data migration failed.", error)
        setState({ status: "failed" })
      }
    })()
  }, [appRun, console])

  const isRunning = state.status === "running"
  const hasReport =
    state.status === "failed" ||
    (state.status === "finished" && state.migrated > 0)
  const hasFailed = state.status === "failed"

  return (
    <>
      <AlertDialog
        open={(isRunning || hasReport) && !dismissed}
        onOpenChange={(open) => {
          // Escape routes through here too, so this is also what keeps the
          // dialog up for the whole run: there is nothing the user can decide
          // until it finishes.
          if (!open && !isRunning) setDismissed(true)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {isRunning
                ? t("migration.running.title")
                : hasFailed
                  ? t("migration.failed.title")
                  : t("migration.success.title")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {isRunning
                ? t("migration.running.description")
                : hasFailed
                  ? t("migration.failed.description")
                  : t("migration.success.description")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {isRunning ? (
            <div className="flex justify-center py-2">
              <LoaderCircleIcon
                className="size-6 animate-spin text-muted-foreground"
                aria-hidden="true"
              />
            </div>
          ) : (
            <AlertDialogFooter>
              <AlertDialogAction
                className={buttonVariants({ size: "lg" })}
                onClick={() => {
                  setDismissed(true)
                }}
              >
                {t("migration.close")}
              </AlertDialogAction>
            </AlertDialogFooter>
          )}
        </AlertDialogContent>
      </AlertDialog>
      {state.status === "checking" || isRunning ? null : children}
    </>
  )
}
