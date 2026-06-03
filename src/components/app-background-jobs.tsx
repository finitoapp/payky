import { createRun } from "@evolu/web"
import { useAtomValue } from "jotai"
import { useEffect } from "react"

import { evoluAtom } from "@/atoms/evolu.ts"
import { backgroundJobs } from "@/core/background-jobs/background-jobs.ts"
import { runBackgroundJobs } from "@/core/background-jobs/run-background-jobs.ts"
import { createDateDep, createFetchDep } from "@/core/deps.ts"

export function AppBackgroundJobs() {
  const evolu = useAtomValue(evoluAtom)

  useEffect(() => {
    let isDisposed = false
    let jobsDisposable: Disposable | null = null
    const run = createRun({
      evolu,
      evoluOwnerId: evolu.appOwner.id,
      ...createDateDep(),
      ...createFetchDep(),
      onError: (error: unknown) => {
        console.error("Background job failed.", error)
      },
    })

    void run
      .orThrow(runBackgroundJobs(backgroundJobs))
      .then((startedJobsDisposable) => {
        if (isDisposed) {
          startedJobsDisposable[Symbol.dispose]()
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
      jobsDisposable?.[Symbol.dispose]()
      void run[Symbol.asyncDispose]()
    }
  }, [evolu])

  return null
}
