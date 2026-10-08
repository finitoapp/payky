import type {
  AppBackgroundJob,
  BackgroundJob,
  OwnerStationJob,
  StationJob,
} from "@/core/background-jobs/background-job-types.ts"
import { startEetReportingJob } from "@/core/background-jobs/jobs/eet-reporting-job.ts"
import { startFioAccountTransactionSyncJob } from "@/core/background-jobs/jobs/fio-account-transaction-sync-job.ts"
import { startOwnerStationJob } from "@/core/background-jobs/jobs/owner-station-job.ts"
import { startSparkAccountTransactionSyncJob } from "@/core/background-jobs/jobs/spark-account-transaction-sync-job.ts"
import { startStationCommsJob } from "@/core/background-jobs/jobs/station-comms-job.ts"
import { startStationLightningWatchJob } from "@/core/background-jobs/jobs/station-lightning-watch-job.ts"

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
] satisfies ReadonlyArray<AppBackgroundJob>

/**
 * A browser or PWA can't reach the FIO API directly, so its sync job is left
 * out there — the same limitation the Fio settings screen warns about in
 * `settings.fioPlugin.nativeRuntimeWarning`.
 */
const browserBackgroundJobs = [
  startSparkAccountTransactionSyncJob,
  startEetReportingJob,
] satisfies ReadonlyArray<AppBackgroundJob>

export function getBackgroundJobsForRuntime(
  isNativePlatform: boolean
): ReadonlyArray<AppBackgroundJob> {
  return isNativePlatform ? nativeBackgroundJobs : browserBackgroundJobs
}

/** What an owner account runs on top of its runtime's jobs. */
export const ownerStationBackgroundJobs = [
  startOwnerStationJob,
] satisfies ReadonlyArray<OwnerStationJob>

/**
 * All a PoS station runs: it watches no bank account or wallet, so no FIO,
 * Spark sync or EET (station/0012, station/0010).
 */
export const stationBackgroundJobs = [
  startStationCommsJob,
  startStationLightningWatchJob,
] satisfies ReadonlyArray<StationJob>
