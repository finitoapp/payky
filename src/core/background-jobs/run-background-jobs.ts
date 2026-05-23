import { ok, type Task } from "@evolu/common"

import type {
  BackgroundJob,
  BackgroundJobContext,
} from "@/core/background-jobs/background-job-types.ts"

export const runBackgroundJobs =
  (
    jobs: ReadonlyArray<BackgroundJob>
  ): Task<AsyncDisposable, never, BackgroundJobContext> =>
  async (run) => {
    const disposer = new AsyncDisposableStack()

    try {
      for (const job of jobs) {
        const result = await run(job)
        if (!result.ok) throw result.error
        const disposable = result.value
        disposer.defer(async () => {
          try {
            await disposable[Symbol.asyncDispose]()
          } catch (error) {
            run.deps.onError(error)
          }
        })
      }
    } catch (error) {
      await disposer.disposeAsync()
      throw error
    }

    return ok(disposer)
  }
