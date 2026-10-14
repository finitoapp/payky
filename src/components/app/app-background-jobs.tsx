import { Capacitor } from "@capacitor/core"
import { createRun } from "@evolu/web"
import { useAtomValue } from "jotai"
import { useEffect } from "react"

import { accountAtom } from "@/atoms/account.ts"
import { deviceEvoluAtom } from "@/atoms/device-evolu.ts"
import {
  cashuShardStoreAtom,
  cashuWalletDepAtom,
  evoluAtom,
} from "@/atoms/evolu.ts"
import { getBackgroundJobsForRuntime } from "@/core/background-jobs/background-jobs.ts"
import { runBackgroundJobs } from "@/core/background-jobs/run-background-jobs.ts"
import {
  createConnectivityDep,
  createDateDep,
  createFetchDep,
} from "@/core/deps.ts"
import { createEetApiDep } from "@/core/integrations/eet/eet-client.ts"
import { createNostrDep } from "@/core/integrations/nostr/nostr-client.ts"
import { useConsole } from "@/hooks/use-console.ts"

export function AppBackgroundJobs() {
  const evolu = useAtomValue(evoluAtom)
  const account = useAtomValue(accountAtom)
  const deviceEvolu = useAtomValue(deviceEvoluAtom)
  const cashuShardStore = useAtomValue(cashuShardStoreAtom)
  const cashuWalletDep = useAtomValue(cashuWalletDepAtom)
  const deviceId = account.device.id
  const { masterKey } = account
  // Every job talks to an outside service (EET, the bank, the Spark wallet),
  // and a demo account's data is fictional: none may run (demo-data/0001).
  const isDemo = account.demo !== null
  const console = useConsole()

  useEffect(() => {
    if (isDemo) return

    const disposeJobs = async (disposable: AsyncDisposable): Promise<void> => {
      await disposable[Symbol.asyncDispose]()
    }

    let isDisposed = false
    let jobsDisposable: AsyncDisposable | null = null
    const dateDep = createDateDep()
    const fetchDep = createFetchDep()
    const run = createRun({
      evolu,
      evoluOwner: evolu.appOwner,
      deviceId,
      ...dateDep,
      ...fetchDep,
      ...createConnectivityDep(),
      ...createEetApiDep({ ...dateDep, ...fetchDep }),
      deviceEvolu,
      masterKey,
      ...createNostrDep(),
      cashuShardStore,
      ...cashuWalletDep,
      lockManager: navigator.locks,
      console,
      onError: (error: unknown) => {
        console.error("Background job failed.", error)
      },
    })

    const startJobs = async (): Promise<void> => {
      try {
        const startedJobsDisposable = await run.ok(
          runBackgroundJobs(
            getBackgroundJobsForRuntime(Capacitor.isNativePlatform())
          )
        )
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
          await run[Symbol.asyncDispose]()
        } catch (error) {
          console.error("Failed to stop background jobs.", error)
        }
      })()
    }
  }, [
    cashuShardStore,
    cashuWalletDep,
    console,
    deviceEvolu,
    deviceId,
    evolu,
    isDemo,
    masterKey,
  ])

  return null
}
