import type {
  BackgroundJob,
  BackgroundJobContext,
} from "@/core/background-jobs/background-job-types.ts"

export function runBackgroundJobs(
  jobs: ReadonlyArray<BackgroundJob>,
  context: BackgroundJobContext
): Disposable {
  const disposer = new DisposableStack()

  try {
    for (const job of jobs) {
      const disposable = job(context)
      disposer.defer(() => {
        try {
          disposable[Symbol.dispose]()
        } catch (error) {
          context.onError(error)
        }
      })
    }
  } catch (error) {
    disposer.dispose()
    throw error
  }

  return disposer
}
