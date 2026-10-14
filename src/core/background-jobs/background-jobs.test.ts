import { describe, expect, test } from "vitest"

import {
  cliBackgroundJobs,
  getBackgroundJobsForRuntime,
} from "./background-jobs.ts"
import { startCashuAccountSyncJob } from "./jobs/cashu-account-sync-job.ts"
import { startEetReportingJob } from "./jobs/eet-reporting-job.ts"
import { startFioAccountTransactionSyncJob } from "./jobs/fio-account-transaction-sync-job.ts"
import { startSparkAccountTransactionSyncJob } from "./jobs/spark-account-transaction-sync-job.ts"

describe("getBackgroundJobsForRuntime", () => {
  test("does not schedule the Fio job in a regular web runtime", () => {
    expect(getBackgroundJobsForRuntime(false)).toEqual([
      startSparkAccountTransactionSyncJob,
      startEetReportingJob,
      startCashuAccountSyncJob,
    ])
  })

  test("schedules the Fio job in supported native runtimes", () => {
    expect(getBackgroundJobsForRuntime(true)).toEqual([
      startFioAccountTransactionSyncJob,
      startSparkAccountTransactionSyncJob,
      startEetReportingJob,
      startCashuAccountSyncJob,
    ])
  })

  test("keeps EET reporting out of the CLI, which has no terminal device", () => {
    expect(cliBackgroundJobs).not.toContain(startEetReportingJob)
  })

  test("keeps the Cashu job out of the CLI, which has no Linky owners", () => {
    expect(cliBackgroundJobs).not.toContain(startCashuAccountSyncJob)
  })
})
