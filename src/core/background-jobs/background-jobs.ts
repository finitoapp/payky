import type { BackgroundJob } from "@/core/background-jobs/background-job-types.ts"
import { startFioAccountTransactionSyncJob } from "@/core/background-jobs/jobs/fio-account-transaction-sync-job.ts"
import { startSparkAccountTransactionSyncJob } from "@/core/background-jobs/jobs/spark-account-transaction-sync-job.ts"
import type { NativeRuntime } from "@/core/native/runtime.ts"
import { isPluginNativeRuntime } from "@/core/native/runtime.ts"

export const nativeBackgroundJobs = [
  startFioAccountTransactionSyncJob,
  startSparkAccountTransactionSyncJob,
] satisfies ReadonlyArray<BackgroundJob>

export const backgroundJobs = nativeBackgroundJobs

export const webBackgroundJobs = [
  startSparkAccountTransactionSyncJob,
] satisfies ReadonlyArray<BackgroundJob>

export function getBackgroundJobsForRuntime(
  runtime: NativeRuntime
): ReadonlyArray<BackgroundJob> {
  return isPluginNativeRuntime(runtime)
    ? nativeBackgroundJobs
    : webBackgroundJobs
}
