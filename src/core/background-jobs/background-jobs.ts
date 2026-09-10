import type { BackgroundJob } from "@/core/background-jobs/background-job-types.ts"
import { startFioAccountTransactionSyncJob } from "@/core/background-jobs/jobs/fio-account-transaction-sync-job.ts"
import { startSparkAccountTransactionSyncJob } from "@/core/background-jobs/jobs/spark-account-transaction-sync-job.ts"

/**
 * Every background job — right for anything that isn't a browser, which is
 * the native app and the CLI.
 */
export const allBackgroundJobs = [
  startFioAccountTransactionSyncJob,
  startSparkAccountTransactionSyncJob,
] satisfies ReadonlyArray<BackgroundJob>

/**
 * A browser or PWA can't reach the FIO API directly, so its sync job is left
 * out there — the same limitation the Fio settings screen warns about in
 * `settings.fioPlugin.nativeRuntimeWarning`.
 */
const browserBackgroundJobs = [
  startSparkAccountTransactionSyncJob,
] satisfies ReadonlyArray<BackgroundJob>

export function getBackgroundJobsForRuntime(
  isNativePlatform: boolean
): ReadonlyArray<BackgroundJob> {
  return isNativePlatform ? allBackgroundJobs : browserBackgroundJobs
}
