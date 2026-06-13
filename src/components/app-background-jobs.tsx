import { createRun } from "@evolu/web"
import { useAtomValue } from "jotai"
import { useEffect } from "react"

import { evoluAtom } from "@/atoms/evolu.ts"
import { backgroundJobs } from "@/core/background-jobs/background-jobs.ts"
import { runBackgroundJobs } from "@/core/background-jobs/run-background-jobs.ts"
import { createDateDep, createFetchDep } from "@/core/deps.ts"
import { useConsole } from "@/hooks/use-console.ts"

export function AppBackgroundJobs() {
  const evolu = useAtomValue(evoluAtom)
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
      console,
      onError: (error: unknown) => {
        console.error("Background job failed.", error)
      },
    })

    void run
      .orThrow(runBackgroundJobs(backgroundJobs))
      .then((startedJobsDisposable) => {
        if (isDisposed) {
          disposeJobs(startedJobsDisposable)
          return
        }

        jobsDisposable = startedJobsDisposable
      })
      .catch((error: unknown) => {
        if (!isDisposed) {
          console.error("Failed to start background jobs.", error)
        }
      })

    return () => {
      isDisposed = true
      if (jobsDisposable != null) disposeJobs(jobsDisposable)
      void run[Symbol.asyncDispose]()
    }
  }, [console, evolu])

  return null
}
