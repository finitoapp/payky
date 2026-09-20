import { Capacitor } from "@capacitor/core"
import { createRun } from "@evolu/web"
import { useAtomValue } from "jotai"
import { useEffect } from "react"

import { cashuWalletAtom } from "@/atoms/cashu-wallet.ts"
import { evoluAtom } from "@/atoms/evolu.ts"
import { getBackgroundJobsForRuntime } from "@/core/background-jobs/background-jobs.ts"
import { runBackgroundJobs } from "@/core/background-jobs/run-background-jobs.ts"
import { createDateDep, createFetchDep } from "@/core/deps.ts"
import { useConsole } from "@/hooks/use-console.ts"

export function AppBackgroundJobs() {
  const evolu = useAtomValue(evoluAtom)
  const cashuWallet = useAtomValue(cashuWalletAtom)
  const console = useConsole()

  useEffect(() => {
    const disposeJobs = (disposable: AsyncDisposable): void => {
      void Promise.resolve(disposable[Symbol.asyncDispose]()).catch(
        (error: unknown) => {
          console.error("Failed to stop background jobs.", error)
        }
      )
    }

    let isDisposed = false
    let jobsDisposable: AsyncDisposable | null = null
    const run = createRun({
      evolu,
      evoluOwnerId: evolu.appOwner.id,
      ...createDateDep(),
      ...createFetchDep(),
      lockManager: navigator.locks,
      cashuWallet,
      console,
      onError: (error: unknown) => {
        console.error("Background job failed.", error)
      },
    })

    void (async () => {
      try {
        const startedJobsDisposable = await run.ok(
          runBackgroundJobs(
            getBackgroundJobsForRuntime(Capacitor.isNativePlatform())
          )
        )
        if (isDisposed) {
          disposeJobs(startedJobsDisposable)
          return
        }

        jobsDisposable = startedJobsDisposable
      } catch (error) {
        if (!isDisposed) {
          console.error("Failed to start background jobs.", error)
        }
      }
    })()

    return () => {
      isDisposed = true
      if (jobsDisposable !== null) disposeJobs(jobsDisposable)
      void run[Symbol.asyncDispose]()
    }
  }, [cashuWallet, console, evolu])

  return null
}
