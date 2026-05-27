import type { BackgroundJob } from "@/core/background-jobs/background-job-types.ts"
import { startSparkAccountTransactionSyncJob } from "@/core/background-jobs/jobs/spark-account-transaction-sync-job.ts"

export const backgroundJobs = [
  startSparkAccountTransactionSyncJob,
] satisfies ReadonlyArray<BackgroundJob>
