import { useAtomValue } from "jotai"
import { LoaderCircleIcon } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { accountAtom } from "@/atoms/account.ts"
import { deviceEvoluAtom } from "@/atoms/device-evolu.ts"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog.tsx"
import { Button, buttonVariants } from "@/components/ui/button.tsx"
import { generateDemoData } from "@/core/demo-data/demo-data-generator.ts"
import { markDemoAccountSeeded } from "@/core/evolu/device-account.ts"
import { useAppRun } from "@/hooks/use-app-run.ts"
import { useConsole } from "@/hooks/use-console.ts"
import { useScreenWakeLock } from "@/hooks/use-screen-wake-lock.ts"
import { useTranslation } from "@/hooks/use-translation.ts"
import { router } from "@/router.tsx"

/** The most history generated, from today back; stopping ends it sooner. */
const maxHistoryDays = 90

type SeedState =
  | { readonly status: "idle" }
  | {
      readonly status: "running"
      readonly done: number
      readonly total: number
    }
  | {
      readonly status: "finished"
      readonly payments: number
      readonly days: number
    }
  | { readonly status: "failed" }

/**
 * Generates a demo account's history the first time the app opens it
 * (demo-data/0001), in a dialog that cannot be dismissed until it is done.
 * History is generated from today back, so stopping — which finishes the day
 * in progress first — leaves an unbroken history up to now.
 *
 * The account is marked seeded before generating, not after: a run cut short
 * by closing the app leaves a partial demo account, which can be removed and
 * created again, rather than a second history generated over the first.
 * A failure is a handled outcome with its own dialog, so it goes to the
 * console, not Sentry.
 */
export function DemoDataSeed() {
  const account = useAtomValue(accountAtom)
  const deviceEvolu = useAtomValue(deviceEvoluAtom)
  const appRun = useAppRun()
  const console = useConsole()
  const { t, language } = useTranslation()
  const [state, setState] = useState<SeedState>({ status: "idle" })
  const [dismissed, setDismissed] = useState(false)
  const started = useRef(false)
  const stopRequested = useRef(false)
  const [stopping, setStopping] = useState(false)
  // Generating takes long enough for a phone to sleep, which suspends it.
  useScreenWakeLock(state.status === "running")

  useEffect(() => {
    if (account.demo !== "pending" || started.current) return
    started.current = true
    markDemoAccountSeeded(deviceEvolu, account.id)

    void (async () => {
      setState({ status: "running", done: 0, total: 1 })
      try {
        await using run = appRun()
        const { payments, days } = await run.ok(
          generateDemoData({
            language,
            now: new Date(),
            days: maxHistoryDays,
            shouldStop: () => stopRequested.current,
            onProgress: (done, total) => {
              setState({ status: "running", done, total })
              // Evolu reruns every subscribed query after each write, and
              // the home screen's grow with the history: wait on a page
              // that subscribes to almost nothing.
              if (done === 0) {
                void router.navigate({ to: "/settings/about", replace: true })
              }
            },
          })
        )
        setState({ status: "finished", payments, days })
        await router.navigate({ to: "/", replace: true })
      } catch (error) {
        console.error("Generating demo data failed.", error)
        setState({ status: "failed" })
      }
    })()
  }, [account.demo, account.id, appRun, console, deviceEvolu, language])

  if (state.status === "idle") return null
  const isRunning = state.status === "running"

  return (
    <AlertDialog
      open={!dismissed}
      onOpenChange={(open) => {
        if (!open && !isRunning) setDismissed(true)
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t(
              state.status === "running"
                ? "demoData.running.title"
                : state.status === "failed"
                  ? "demoData.failed.title"
                  : "demoData.finished.title"
            )}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {state.status === "running"
              ? t("demoData.running.description")
              : state.status === "failed"
                ? t("demoData.failed.description")
                : t("demoData.finished.description", {
                    payments: String(state.payments),
                    days: String(state.days),
                  })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {state.status === "running" ? (
          <div className="flex flex-col gap-2 py-2">
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary transition-[width]"
                style={{ width: `${(state.done / state.total) * 100}%` }}
              />
            </div>
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <LoaderCircleIcon
                className="size-4 animate-spin"
                aria-hidden="true"
              />
              {t(
                stopping
                  ? "demoData.running.stopping"
                  : "demoData.running.progress",
                {
                  done: String(state.done),
                  total: String(state.total),
                }
              )}
            </p>
            <Button
              type="button"
              variant="outline"
              size="lg"
              disabled={stopping}
              onClick={() => {
                stopRequested.current = true
                setStopping(true)
              }}
            >
              {t("demoData.stop")}
            </Button>
          </div>
        ) : (
          <AlertDialogFooter>
            <AlertDialogAction
              className={buttonVariants({ size: "lg" })}
              onClick={() => {
                setDismissed(true)
              }}
            >
              {t("demoData.close")}
            </AlertDialogAction>
          </AlertDialogFooter>
        )}
      </AlertDialogContent>
    </AlertDialog>
  )
}
