import { createRun } from "@evolu/web"
import { useAtomValue } from "jotai"
import { useMemo } from "react"

import { accountAtom } from "@/atoms/account.ts"
import { deviceEvoluAtom } from "@/atoms/device-evolu.ts"
import { cashuShardStoreAtom } from "@/atoms/evolu.ts"
import { createCashuWalletDep } from "@/core/cashu/cashu-wallet.ts"
import { createDateDep, createFetchDep } from "@/core/deps.ts"
import { createEetApiDep } from "@/core/integrations/eet/eet-client.ts"
import { createNostrDep } from "@/core/integrations/nostr/nostr-client.ts"
import { createYadioApiDep } from "@/core/integrations/yadio/yadio-client.ts"
import { deriveCashuWalletSeed } from "@/core/modules/shared/key-derivation.ts"
import { createSwitchioTerminalDep } from "@/core/native/switchio.ts"
import { createE2eSparkWalletDep } from "@/core/spark/e2e-spark-wallet.ts"
import { createSparkWalletDep } from "@/core/spark/spark-wallet.ts"
import { useConsole } from "@/hooks/use-console.ts"
import { useEvolu } from "@/hooks/use-evolu.ts"

/**
 * Composition root for running Task actions from React.
 *
 * Returns a stable factory that creates a disposable Run wired with the full
 * superset of app dependencies (console, evolu, deviceEvolu, evoluOwnerId,
 * date, fetch, sparkWallet, yadioApi, switchioTerminal, eetApi, nostr,
 * lockManager, cashuShardStore, cashuWallet). Task
 * dependency typing is structural, so Tasks that need only a subset are
 * unaffected by the extra deps.
 *
 * ### Example
 *
 * ```tsx
 * const appRun = useAppRun()
 *
 * const handleSubmit = async () => {
 *   await using run = appRun()
 *   const result = await run(someAction(...))
 *   // or several sequential calls: await run.orThrow(otherAction(...))
 * }
 * ```
 */
export const useAppRun = () => {
  const console = useConsole()
  const evolu = useEvolu()
  const account = useAtomValue(accountAtom)
  const deviceEvolu = useAtomValue(deviceEvoluAtom)
  const cashuShardStore = useAtomValue(cashuShardStoreAtom)
  // One per account, so a mint's loaded keysets survive between runs.
  const cashuWalletDep = useMemo(
    () =>
      createCashuWalletDep({
        seed: deriveCashuWalletSeed(account.masterKey),
        deviceAccountId: account.id,
        fetch: createFetchDep().fetch,
      }),
    [account.masterKey, account.id]
  )

  return useMemo(() => {
    return () => {
      const dateDep = createDateDep()
      const fetchDep = createFetchDep()

      return createRun({
        console,
        evolu,
        deviceEvolu,
        evoluOwnerId: evolu.appOwner.id,
        masterKey: account.masterKey,
        lockManager: navigator.locks,
        ...dateDep,
        ...fetchDep,
        ...(createE2eSparkWalletDep() ?? createSparkWalletDep()),
        ...createYadioApiDep(),
        ...createSwitchioTerminalDep(),
        ...createEetApiDep({ ...dateDep, ...fetchDep }),
        ...createNostrDep(),
        cashuShardStore,
        ...cashuWalletDep,
      })
    }
  }, [
    account.masterKey,
    cashuShardStore,
    cashuWalletDep,
    console,
    deviceEvolu,
    evolu,
  ])
}
