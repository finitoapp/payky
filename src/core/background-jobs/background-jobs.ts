import type {
  BackgroundJob,
  CashuBackgroundJob,
} from "@/core/background-jobs/background-job-types.ts"
import { startCashuAccountSyncJob } from "@/core/background-jobs/jobs/cashu-account-sync-job.ts"
import { startEetReportingJob } from "@/core/background-jobs/jobs/eet-reporting-job.ts"
import { startFioAccountTransactionSyncJob } from "@/core/background-jobs/jobs/fio-account-transaction-sync-job.ts"
import { startSparkAccountTransactionSyncJob } from "@/core/background-jobs/jobs/spark-account-transaction-sync-job.ts"

/**
 * Right for the CLI.
 */
export const cliBackgroundJobs = [
  startFioAccountTransactionSyncJob,
  startSparkAccountTransactionSyncJob,
] satisfies ReadonlyArray<BackgroundJob>

const nativeBackgroundJobs = [
  ...cliBackgroundJobs,
  startEetReportingJob,
  startCashuAccountSyncJob,
] satisfies ReadonlyArray<CashuBackgroundJob>

/**
 * A browser or PWA can't reach the FIO API directly, so its sync job is left
 * out there — the same limitation the Fio settings screen warns about in
 * `settings.fioPlugin.nativeRuntimeWarning`.
 */
const browserBackgroundJobs = [
  startSparkAccountTransactionSyncJob,
  startEetReportingJob,
  startCashuAccountSyncJob,
] satisfies ReadonlyArray<CashuBackgroundJob>

export function getBackgroundJobsForRuntime(
  isNativePlatform: boolean
): ReadonlyArray<CashuBackgroundJob> {
  return isNativePlatform ? nativeBackgroundJobs : browserBackgroundJobs
}
