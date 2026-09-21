import { describe, expect, test } from "vitest"

import { getBackgroundJobsForRuntime } from "./background-jobs.ts"
import { startCashuAccountTransactionSyncJob } from "./jobs/cashu-account-transaction-sync-job.ts"
import { startFioAccountTransactionSyncJob } from "./jobs/fio-account-transaction-sync-job.ts"
import { startNostrCashuInboxJob } from "./jobs/nostr-cashu-inbox-job.ts"
import { startSparkAccountTransactionSyncJob } from "./jobs/spark-account-transaction-sync-job.ts"

describe("getBackgroundJobsForRuntime", () => {
  test("does not schedule the Fio job in a regular web runtime", () => {
    expect(getBackgroundJobsForRuntime(false)).toEqual([
      startSparkAccountTransactionSyncJob,
      startCashuAccountTransactionSyncJob,
      startNostrCashuInboxJob,
    ])
  })

  test("schedules the Fio job in supported native runtimes", () => {
    expect(getBackgroundJobsForRuntime(true)).toEqual([
      startFioAccountTransactionSyncJob,
      startSparkAccountTransactionSyncJob,
      startCashuAccountTransactionSyncJob,
      startNostrCashuInboxJob,
    ])
  })
})
