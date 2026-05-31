import { ok, testCreateConsole, testCreateRun } from "@evolu/common"
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
  test("starts every job with the shared context", async () => {
    const context = createBackgroundJobContext()
    const startedJobs: string[] = []

    const jobs: BackgroundJob[] = [
      (run) => {
        expect(run.deps.evolu).toBe(context.evolu)
        startedJobs.push("first")
        return ok(createDisposable(() => {}))
      },
      (run) => {
        expect(run.deps.evolu).toBe(context.evolu)
        startedJobs.push("second")
        return ok(createDisposable(() => {}))
      },
    ]

    await using run = testCreateRun(context)
    using _disposable = await run.orThrow(runBackgroundJobs(jobs))

    expect(startedJobs).toEqual(["first", "second"])
  })

  test("disposes started jobs in reverse order", async () => {
    const context = createBackgroundJobContext()
    const disposedJobs: string[] = []

    {
      await using run = testCreateRun(context)
      using _disposable = await run.orThrow(
        runBackgroundJobs([
          () => ok(createDisposable(() => disposedJobs.push("first"))),
          () => ok(createDisposable(() => disposedJobs.push("second"))),
          () => ok(createDisposable(() => disposedJobs.push("third"))),
        ])
      )
    }

    expect(disposedJobs).toEqual(["third", "second", "first"])
  })

  test("continues disposing remaining jobs when one cleanup fails", async () => {
    const cleanupError = new Error("Cleanup failed.")
    const errors: unknown[] = []
    const context = createBackgroundJobContext(errors)
    const disposedJobs: string[] = []

    {
      await using run = testCreateRun(context)
      using _disposable = await run.orThrow(
        runBackgroundJobs([
          () => ok(createDisposable(() => disposedJobs.push("first"))),
          () =>
            ok(
              createDisposable(() => {
                disposedJobs.push("second")
                throw cleanupError
              })
            ),
          () => ok(createDisposable(() => disposedJobs.push("third"))),
        ])
      )
    }

    expect(disposedJobs).toEqual(["third", "second", "first"])
    expect(errors).toEqual([cleanupError])
  })

  test("disposes already started jobs when a later job fails to start", async () => {
    const startError = new Error("Start failed.")
    const errors: unknown[] = []
    const context = createBackgroundJobContext(errors)
    const disposedJobs: string[] = []

    const jobs: ReadonlyArray<BackgroundJob> = [
      () => ok(createDisposable(() => disposedJobs.push("first"))),
      () => {
        throw startError
      },
      () => ok(createDisposable(() => disposedJobs.push("third"))),
    ]

    await using run = testCreateRun(context)
    await expect(run.orThrow(runBackgroundJobs(jobs))).rejects.toThrow(
      startError
    )
    expect(disposedJobs).toEqual(["first"])
    expect(errors).toEqual([])
  })
})
