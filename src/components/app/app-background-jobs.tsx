import { Capacitor } from "@capacitor/core"
import { createRun } from "@evolu/web"
import { useAtomValue } from "jotai"
import { useEffect } from "react"

import { toast } from "sonner"
import { accountAtom } from "@/atoms/account.ts"
import { deviceEvoluAtom } from "@/atoms/device-evolu.ts"
import { evoluAtom } from "@/atoms/evolu.ts"
import {
  getBackgroundJobsForRuntime,
  ownerStationBackgroundJobs,
  stationBackgroundJobs,
} from "@/core/background-jobs/background-jobs.ts"
import { runBackgroundJobs } from "@/core/background-jobs/run-background-jobs.ts"
import {
  createConnectivityDep,
  createDateDep,
  createFetchDep,
} from "@/core/deps.ts"
import { removeDeviceAccount } from "@/core/evolu/device-account.ts"
import { createEetApiDep } from "@/core/integrations/eet/eet-client.ts"
import { createNostrDep } from "@/core/integrations/nostr/nostr-client.ts"
import {
  createSparkSyncWalletDep,
  createSparkWalletDep,
} from "@/core/spark/spark-wallet.ts"
import { useConsole } from "@/hooks/use-console.ts"
import { useReloadAppEvolu } from "@/hooks/use-reload-app-evolu.ts"
import { useTranslation } from "@/hooks/use-translation.ts"

export function AppBackgroundJobs() {
  const evolu = useAtomValue(evoluAtom)
  const account = useAtomValue(accountAtom)
  const deviceEvolu = useAtomValue(deviceEvoluAtom)
  const reloadAppEvolu = useReloadAppEvolu()
  const { t } = useTranslation()
  const console = useConsole()
  const deviceId = account.device.id
  const accountId = account.id
  const masterKey = account.masterKey
  const stationOwnerPubkey =
    account.kind === "station" ? account.stationOwnerPubkey : null
  const revokedToast = t("station.revoked.toast")

  useEffect(() => {
    const disposeJobs = async (disposable: AsyncDisposable): Promise<void> => {
      await disposable[Symbol.asyncDispose]()
    }

    let isDisposed = false
    let jobsDisposable: AsyncDisposable | null = null
    const dateDep = createDateDep()
    const fetchDep = createFetchDep()
    const run = createRun({
      evolu,
      evoluOwnerId: evolu.appOwner.id,
      deviceId,
      ...dateDep,
      ...fetchDep,
      ...createConnectivityDep(),
      ...createEetApiDep({ ...dateDep, ...fetchDep }),
      ...createNostrDep(),
      ...createSparkWalletDep(),
      ...createSparkSyncWalletDep(),
      masterKey,
      lockManager: navigator.locks,
      console,
      onError: (error: unknown) => {
        console.error("Background job failed.", error)
      },
    })
    const stationRun =
      stationOwnerPubkey === null
        ? null
        : run.create({
            ...run.deps,
            stationAccount: {
              ownerPubkey: stationOwnerPubkey,
              // The owner revoked this station (station/0005): leave it,
              // which falls back to the device's most recently used account.
              onRevoked: async () => {
                removeDeviceAccount(deviceEvolu, accountId)
                toast.info(revokedToast)
                reloadAppEvolu()
              },
            },
          })

    const startJobs = async (): Promise<void> => {
      try {
        // A PoS station runs only its own jobs; an owner runs its usual
        // ones and the line to its stations.
        const startedJobsDisposable =
          stationRun === null
            ? await run.ok(
                runBackgroundJobs([
                  ...getBackgroundJobsForRuntime(Capacitor.isNativePlatform()),
                  ...ownerStationBackgroundJobs,
                ])
              )
            : await stationRun.ok(runBackgroundJobs(stationBackgroundJobs))
        if (isDisposed) {
          await disposeJobs(startedJobsDisposable)
          return
        }

        jobsDisposable = startedJobsDisposable
      } catch (error) {
        if (!isDisposed) {
          console.error("Failed to start background jobs.", error)
        }
      }
    }
    const startingJobs = startJobs()

    return () => {
      isDisposed = true
      void (async () => {
        try {
          await startingJobs
          if (jobsDisposable !== null) await disposeJobs(jobsDisposable)
          await stationRun?.[Symbol.asyncDispose]()
          await run[Symbol.asyncDispose]()
        } catch (error) {
          console.error("Failed to stop background jobs.", error)
        }
      })()
    }
  }, [
    accountId,
    console,
    deviceEvolu,
    deviceId,
    evolu,
    masterKey,
    reloadAppEvolu,
    revokedToast,
    stationOwnerPubkey,
  ])

  return null
}
