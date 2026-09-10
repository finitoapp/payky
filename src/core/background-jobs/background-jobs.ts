import type { BackgroundJob } from "@/core/background-jobs/background-job-types.ts"
import { startFioAccountTransactionSyncJob } from "@/core/background-jobs/jobs/fio-account-transaction-sync-job.ts"
import { startSparkAccountTransactionSyncJob } from "@/core/background-jobs/jobs/spark-account-transaction-sync-job.ts"

export const nativeBackgroundJobs = [
  startFioAccountTransactionSyncJob,
  startSparkAccountTransactionSyncJob,
] satisfies ReadonlyArray<BackgroundJob>

export const backgroundJobs = nativeBackgroundJobs

export const webBackgroundJobs = [
  startSparkAccountTransactionSyncJob,
] satisfies ReadonlyArray<BackgroundJob>

export function getBackgroundJobsForRuntime(
  isNativePlatform: boolean
): ReadonlyArray<BackgroundJob> {
  return isNativePlatform ? nativeBackgroundJobs : webBackgroundJobs
}
