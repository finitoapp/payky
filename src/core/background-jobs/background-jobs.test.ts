import { describe, expect, test } from "vitest"

import { getBackgroundJobsForRuntime } from "./background-jobs.ts"
import { startFioAccountTransactionSyncJob } from "./jobs/fio-account-transaction-sync-job.ts"
import { startSparkAccountTransactionSyncJob } from "./jobs/spark-account-transaction-sync-job.ts"

describe("getBackgroundJobsForRuntime", () => {
  test("does not schedule the Fio job in a regular web runtime", () => {
    expect(getBackgroundJobsForRuntime("web")).toEqual([
      startSparkAccountTransactionSyncJob,
    ])
  })

  test("schedules the Fio job in supported native runtimes", () => {
    expect(getBackgroundJobsForRuntime("capacitor")).toEqual([
      startFioAccountTransactionSyncJob,
      startSparkAccountTransactionSyncJob,
    ])
  })
})
