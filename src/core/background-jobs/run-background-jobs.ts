import type {
  BackgroundJob,
  BackgroundJobContext,
} from "@/core/background-jobs/background-job-types.ts"

export function runBackgroundJobs(
  jobs: ReadonlyArray<BackgroundJob>,
  context: BackgroundJobContext
): Disposable {
  const disposables: Disposable[] = []

  try {
    for (const job of jobs) {
      disposables.push(job(context))
    }
  } catch (error) {
    disposeBackgroundJobs(disposables, context)
    throw error
  }

  return {
    [Symbol.dispose]: () => {
      disposeBackgroundJobs(disposables, context)
    },
  }
}

function disposeBackgroundJobs(
  disposables: ReadonlyArray<Disposable>,
  context: BackgroundJobContext
): void {
  for (const disposable of disposables.toReversed()) {
    try {
      disposable[Symbol.dispose]()
    } catch (error) {
      context.onError(error)
    }
  }
}
