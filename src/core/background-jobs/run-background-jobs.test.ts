import { testCreateConsole } from "@evolu/common"
import { describe, expect, test } from "vitest"

import type {
  BackgroundJob,
  BackgroundJobContext,
} from "@/core/background-jobs/background-job-types.ts"
import type { Evolu } from "@/core/evolu/schema.ts"
import { runBackgroundJobs } from "./run-background-jobs.ts"

const createBackgroundJobContext = (
  errors: unknown[] = []
): BackgroundJobContext => ({
  console: testCreateConsole(),
  evolu: {} as Evolu,
  onError: (error) => {
    errors.push(error)
  },
})

const createDisposable = (dispose: () => void): Disposable => ({
  [Symbol.dispose]: dispose,
})

describe("runBackgroundJobs", () => {
  test("starts every job with the shared context", () => {
    const context = createBackgroundJobContext()
    const startedJobs: string[] = []

    const jobs = [
      ((receivedContext) => {
        expect(receivedContext).toBe(context)
        startedJobs.push("first")
        return createDisposable(() => {})
      }) satisfies BackgroundJob,
      ((receivedContext) => {
        expect(receivedContext).toBe(context)
        startedJobs.push("second")
        return createDisposable(() => {})
      }) satisfies BackgroundJob,
    ]

    using _disposable = runBackgroundJobs(jobs, context)

    expect(startedJobs).toEqual(["first", "second"])
  })

  test("disposes started jobs in reverse order", () => {
    const context = createBackgroundJobContext()
    const disposedJobs: string[] = []

    {
      using _disposable = runBackgroundJobs(
        [
          () => createDisposable(() => disposedJobs.push("first")),
          () => createDisposable(() => disposedJobs.push("second")),
          () => createDisposable(() => disposedJobs.push("third")),
        ],
        context
      )
    }

    expect(disposedJobs).toEqual(["third", "second", "first"])
  })

  test("continues disposing remaining jobs when one cleanup fails", () => {
    const cleanupError = new Error("Cleanup failed.")
    const errors: unknown[] = []
    const context = createBackgroundJobContext(errors)
    const disposedJobs: string[] = []

    {
      using _disposable = runBackgroundJobs(
        [
          () => createDisposable(() => disposedJobs.push("first")),
          () =>
            createDisposable(() => {
              disposedJobs.push("second")
              throw cleanupError
            }),
          () => createDisposable(() => disposedJobs.push("third")),
        ],
        context
      )
    }

    expect(disposedJobs).toEqual(["third", "second", "first"])
    expect(errors).toEqual([cleanupError])
  })

  test("disposes already started jobs when a later job fails to start", () => {
    const startError = new Error("Start failed.")
    const errors: unknown[] = []
    const context = createBackgroundJobContext(errors)
    const disposedJobs: string[] = []

    const jobs: ReadonlyArray<BackgroundJob> = [
      () => createDisposable(() => disposedJobs.push("first")),
      () => {
        throw startError
      },
      () => createDisposable(() => disposedJobs.push("third")),
    ]

    expect(() => runBackgroundJobs(jobs, context)).toThrow(startError)
    expect(disposedJobs).toEqual(["first"])
    expect(errors).toEqual([])
  })
})
