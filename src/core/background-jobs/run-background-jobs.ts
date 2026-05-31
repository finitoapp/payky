import { ok, type Task } from "@evolu/common"

import type {
  BackgroundJob,
  BackgroundJobContext,
} from "@/core/background-jobs/background-job-types.ts"

export const runBackgroundJobs =
  (
    jobs: ReadonlyArray<BackgroundJob>
  ): Task<Disposable, never, BackgroundJobContext> =>
  async (run) => {
    const disposer = new DisposableStack()

    try {
      for (const job of jobs) {
        const result = await run(job)
        if (!result.ok) throw result.error
        const disposable = result.value
        disposer.defer(() => {
          try {
            disposable[Symbol.dispose]()
          } catch (error) {
            run.deps.onError(error)
          }
        })
      }
    } catch (error) {
      disposer.dispose()
      throw error
    }

    return ok(disposer)
  }
