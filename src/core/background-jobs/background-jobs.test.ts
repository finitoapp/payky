import { describe, expect, test } from "vitest"

import {
  cliBackgroundJobs,
  getBackgroundJobsForRuntime,
  stationBackgroundJobs,
} from "./background-jobs.ts"
import { startEetReportingJob } from "./jobs/eet-reporting-job.ts"
import { startFioAccountTransactionSyncJob } from "./jobs/fio-account-transaction-sync-job.ts"
import { startSparkAccountTransactionSyncJob } from "./jobs/spark-account-transaction-sync-job.ts"
import { startStationCommsJob } from "./jobs/station-comms-job.ts"
import { startStationLightningWatchJob } from "./jobs/station-lightning-watch-job.ts"

describe("getBackgroundJobsForRuntime", () => {
  test("does not schedule the Fio job in a regular web runtime", () => {
    expect(getBackgroundJobsForRuntime(false)).toEqual([
      startSparkAccountTransactionSyncJob,
      startEetReportingJob,
    ])
  })

  test("schedules the Fio job in supported native runtimes", () => {
    expect(getBackgroundJobsForRuntime(true)).toEqual([
      startFioAccountTransactionSyncJob,
      startSparkAccountTransactionSyncJob,
      startEetReportingJob,
    ])
  })

  test("keeps EET reporting out of the CLI, which has no terminal device", () => {
    expect(cliBackgroundJobs).not.toContain(startEetReportingJob)
  })
})

describe("stationBackgroundJobs", () => {
  test("settles nothing at a station: no FIO, Spark sync or EET", () => {
    expect(stationBackgroundJobs).toEqual([
      startStationCommsJob,
      startStationLightningWatchJob,
    ])
  })
})
