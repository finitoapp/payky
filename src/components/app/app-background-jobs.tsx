import { Capacitor } from "@capacitor/core"
import { createRun } from "@evolu/web"
import { useAtomValue } from "jotai"
import { useEffect, useMemo } from "react"

import { accountAtom } from "@/atoms/account.ts"
import { cashuWalletAtom } from "@/atoms/cashu-wallet.ts"
import { evoluAtom } from "@/atoms/evolu.ts"
import { linkyStoreProviderAtom } from "@/atoms/linky-store.ts"
import { getBackgroundJobsForRuntime } from "@/core/background-jobs/background-jobs.ts"
import { runBackgroundJobs } from "@/core/background-jobs/run-background-jobs.ts"
import { createDateDep, createFetchDep } from "@/core/deps.ts"
import { linkyEnv } from "@/core/linky/linky-env.ts"
import { createLinkyNostrInboxSource } from "@/core/linky/nostr-inbox-source.ts"
import { useConsole } from "@/hooks/use-console.ts"

export function AppBackgroundJobs() {
  const evolu = useAtomValue(evoluAtom)
  const cashuWallet = useAtomValue(cashuWalletAtom)
  // Both already resolved: the wallet atom awaited them.
  const { masterKey } = useAtomValue(accountAtom)
  const linkyStoreProvider = useAtomValue(linkyStoreProviderAtom)
  const console = useConsole()
  const nostrInbox = useMemo(
    () =>
      createLinkyNostrInboxSource({
        openStore: linkyStoreProvider.get,
        masterKey,
        bootstrapRelays: linkyEnv.VITE_LINKY_NOSTR_RELAYS,
      }),
    [linkyStoreProvider, masterKey]
  )

  useEffect(() => {
    const disposeJobs = (disposable: AsyncDisposable): void => {
      void Promise.resolve(disposable[Symbol.asyncDispose]()).catch(
        (error: unknown) => {
          console.error("Failed to stop background jobs.", error)
        }
      )
    }

    let isDisposed = false
    let jobsDisposable: AsyncDisposable | null = null
    const run = createRun({
      evolu,
      evoluOwnerId: evolu.appOwner.id,
      ...createDateDep(),
      ...createFetchDep(),
      lockManager: navigator.locks,
      cashuWallet,
      nostrInbox,
      console,
      onError: (error: unknown) => {
        console.error("Background job failed.", error)
      },
    })

    void (async () => {
      try {
        const startedJobsDisposable = await run.ok(
          runBackgroundJobs(
            getBackgroundJobsForRuntime(Capacitor.isNativePlatform())
          )
        )
        if (isDisposed) {
          disposeJobs(startedJobsDisposable)
          return
        }

        jobsDisposable = startedJobsDisposable
      } catch (error) {
        if (!isDisposed) {
          console.error("Failed to start background jobs.", error)
        }
      }
    })()

    return () => {
      isDisposed = true
      if (jobsDisposable !== null) disposeJobs(jobsDisposable)
      void run[Symbol.asyncDispose]()
    }
  }, [cashuWallet, console, evolu, nostrInbox])

  return null
}
