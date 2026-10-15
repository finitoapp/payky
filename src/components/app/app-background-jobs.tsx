import { Capacitor } from "@capacitor/core"
import { createRun } from "@evolu/web"
import { useAtomValue } from "jotai"
import { useCallback, useEffect } from "react"

import { accountAtom } from "@/atoms/account.ts"
import { deviceEvoluAtom } from "@/atoms/device-evolu.ts"
import {
  cashuShardStoreAtom,
  cashuWalletDepAtom,
  evoluAtom,
} from "@/atoms/evolu.ts"
import {
  cashuBackgroundJobs,
  getBackgroundJobsForRuntime,
} from "@/core/background-jobs/background-jobs.ts"
import { runBackgroundJobs } from "@/core/background-jobs/run-background-jobs.ts"
import {
  createConnectivityDep,
  createDateDep,
  createFetchDep,
} from "@/core/deps.ts"
import type { Evolu } from "@/core/evolu/schema.ts"
import { createEetApiDep } from "@/core/integrations/eet/eet-client.ts"
import { createNostrDep } from "@/core/integrations/nostr/nostr-client.ts"
import type { DeviceId } from "@/core/modules/device/device-types.ts"
import { useConsole } from "@/hooks/use-console.ts"

type Console = ReturnType<typeof useConsole>

/** The app's own job context, without the Cashu wallet. */
const createAppJobDeps = ({
  evolu,
  deviceId,
  console,
}: {
  readonly evolu: Evolu
  readonly deviceId: DeviceId
  readonly console: Console
}) => {
  const dateDep = createDateDep()
  const fetchDep = createFetchDep()
  return {
    evolu,
    evoluOwner: evolu.appOwner,
    deviceId,
    ...dateDep,
    ...fetchDep,
    ...createConnectivityDep(),
    ...createEetApiDep({ ...dateDep, ...fetchDep }),
    lockManager: navigator.locks,
    console,
    onError: (error: unknown) => {
      console.error("Background job failed.", error)
    },
  }
}

/**
 * Runs what `start` starts, and stops it with the component. Every job talks
 * to an outside service, and a demo account's data is fictional: none may
 * run there (demo-data/0001).
 */
const useBackgroundJobs = ({
  isDemo,
  console,
  start,
}: {
  readonly isDemo: boolean
  readonly console: Console
  /** The run the jobs live in and the jobs started in it; stable unless they must restart. */
  readonly start: () => {
    readonly run: AsyncDisposable
    readonly jobs: Promise<AsyncDisposable>
  }
}) => {
  useEffect(() => {
    if (isDemo) return

    let isDisposed = false
    let jobsDisposable: AsyncDisposable | null = null
    const { run, jobs } = start()

    const startJobs = async (): Promise<void> => {
      try {
        const startedJobsDisposable = await jobs
        if (isDisposed) {
          await startedJobsDisposable[Symbol.asyncDispose]()
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
          if (jobsDisposable !== null)
            await jobsDisposable[Symbol.asyncDispose]()
          await run[Symbol.asyncDispose]()
        } catch (error) {
          console.error("Failed to stop background jobs.", error)
        }
      })()
    }
  }, [console, isDemo, start])
}

/** The FIO, Spark and EET jobs: none of them reads the Cashu wallet. */
export function AppBackgroundJobs() {
  const evolu = useAtomValue(evoluAtom)
  const account = useAtomValue(accountAtom)
  const console = useConsole()
  const deviceId = account.device.id
  const start = useCallback(() => {
    const run = createRun(createAppJobDeps({ evolu, deviceId, console }))
    return {
      run,
      jobs: run.ok(
        runBackgroundJobs(
          getBackgroundJobsForRuntime(Capacitor.isNativePlatform())
        )
      ),
    }
  }, [console, deviceId, evolu])

  useBackgroundJobs({ isDemo: account.demo !== null, console, start })

  return null
}

/**
 * The Cashu job, apart from the others: it suspends on and throws from the
 * Cashu atoms alone, under its own boundary in `App.tsx`, so a Cashu wallet
 * that fails to start, or never does, stops no other job.
 */
export function CashuBackgroundJobs() {
  const evolu = useAtomValue(evoluAtom)
  const account = useAtomValue(accountAtom)
  const deviceEvolu = useAtomValue(deviceEvoluAtom)
  const cashuShardStore = useAtomValue(cashuShardStoreAtom)
  const cashuWalletDep = useAtomValue(cashuWalletDepAtom)
  const console = useConsole()
  const deviceId = account.device.id
  const { masterKey } = account
  const start = useCallback(() => {
    const run = createRun({
      ...createAppJobDeps({ evolu, deviceId, console }),
      deviceEvolu,
      masterKey,
      ...createNostrDep(),
      cashuShardStore,
      ...cashuWalletDep,
    })
    return { run, jobs: run.ok(runBackgroundJobs(cashuBackgroundJobs)) }
  }, [
    cashuShardStore,
    cashuWalletDep,
    console,
    deviceEvolu,
    deviceId,
    evolu,
    masterKey,
  ])

  useBackgroundJobs({ isDemo: account.demo !== null, console, start })

  return null
}
