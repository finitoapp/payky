import type { BackgroundJob } from "@/core/background-jobs/background-job-types.ts"
import { startFioAccountTransactionSyncJob } from "@/core/background-jobs/jobs/fio-account-transaction-sync-job.ts"
import { startSparkAccountTransactionSyncJob } from "@/core/background-jobs/jobs/spark-account-transaction-sync-job.ts"

export const backgroundJobs = [
  startFioAccountTransactionSyncJob,
  startSparkAccountTransactionSyncJob,
] satisfies ReadonlyArray<BackgroundJob>
