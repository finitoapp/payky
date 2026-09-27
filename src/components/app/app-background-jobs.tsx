import { Capacitor } from "@capacitor/core"
import { createRun } from "@evolu/web"
import { useAtomValue } from "jotai"
import { useEffect } from "react"

import { accountAtom } from "@/atoms/account.ts"
import { evoluAtom } from "@/atoms/evolu.ts"
import { getBackgroundJobsForRuntime } from "@/core/background-jobs/background-jobs.ts"
import { runBackgroundJobs } from "@/core/background-jobs/run-background-jobs.ts"
import {
  createConnectivityDep,
  createDateDep,
  createFetchDep,
} from "@/core/deps.ts"
import { createEetApiDep } from "@/core/integrations/eet/eet-client.ts"
import { useConsole } from "@/hooks/use-console.ts"

export function AppBackgroundJobs() {
  const evolu = useAtomValue(evoluAtom)
  const deviceId = useAtomValue(accountAtom).device.id
  const console = useConsole()

  useEffect(() => {
    const disposeJobs = async (disposable: AsyncDisposable): Promise<void> => {
      await disposable[Symbol.asyncDispose]()
    }

    let isDisposed = false
    let jobsDisposable: AsyncDisposable | null = null
    const dateDep = createDateDep()
    const fetchDep = createFetchDep()
    const run = createRun({
      evolu,
      evoluOwnerId: evolu.appOwner.id,
      deviceId,
      ...dateDep,
      ...fetchDep,
      ...createConnectivityDep(),
      ...createEetApiDep({ ...dateDep, ...fetchDep }),
      lockManager: navigator.locks,
      console,
      onError: (error: unknown) => {
        console.error("Background job failed.", error)
      },
    })

    const startJobs = async (): Promise<void> => {
      try {
        const startedJobsDisposable = await run.ok(
          runBackgroundJobs(
            getBackgroundJobsForRuntime(Capacitor.isNativePlatform())
          )
        )
        if (isDisposed) {
          await disposeJobs(startedJobsDisposable)
          return
        }

        jobsDisposable = startedJobsDisposable
      } catch (error) {
        if (!isDisposed) {
          console.error("Failed to start background jobs.", error)
        }
      }
    }
    const startingJobs = startJobs()

    return () => {
      isDisposed = true
      void (async () => {
        try {
          await startingJobs
          if (jobsDisposable !== null) await disposeJobs(jobsDisposable)
          await run[Symbol.asyncDispose]()
        } catch (error) {
          console.error("Failed to stop background jobs.", error)
        }
      })()
    }
  }, [console, deviceId, evolu])

  return null
}
