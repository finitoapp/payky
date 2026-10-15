import { createRun } from "@evolu/web"
import { useAtomValue, useStore } from "jotai"
import { useCallback, useMemo } from "react"

import { accountAtom } from "@/atoms/account.ts"
import { deviceEvoluAtom } from "@/atoms/device-evolu.ts"
import { cashuShardStoreAtom, cashuWalletDepAtom } from "@/atoms/evolu.ts"
import { createDateDep, createFetchDep } from "@/core/deps.ts"
import { createEetApiDep } from "@/core/integrations/eet/eet-client.ts"
import { createNostrDep } from "@/core/integrations/nostr/nostr-client.ts"
import { createYadioApiDep } from "@/core/integrations/yadio/yadio-client.ts"
import { createSwitchioTerminalDep } from "@/core/native/switchio.ts"
import { createE2eSparkWalletDep } from "@/core/spark/e2e-spark-wallet.ts"
import { createSparkWalletDep } from "@/core/spark/spark-wallet.ts"
import { useConsole } from "@/hooks/use-console.ts"
import { useEvolu } from "@/hooks/use-evolu.ts"

/**
 * Composition root for running Task actions from React.
 *
 * Returns a stable factory that creates a disposable Run wired with the full
 * superset of app dependencies (console, evolu, deviceEvolu, evoluOwner,
 * date, fetch, sparkWallet, yadioApi, switchioTerminal, eetApi, nostr,
 * lockManager); the Cashu wallet comes from `useCashuAppRun`. Task
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
/** Every app dependency but the Cashu ones, built fresh for each run. */
const useAppRunDeps = () => {
  const console = useConsole()
  const evolu = useEvolu()
  const account = useAtomValue(accountAtom)
  const deviceEvolu = useAtomValue(deviceEvoluAtom)

  return useCallback(() => {
    const dateDep = createDateDep()
    const fetchDep = createFetchDep()

    return {
      console,
      evolu,
      deviceEvolu,
      evoluOwner: evolu.appOwner,
      masterKey: account.masterKey,
      lockManager: navigator.locks,
      ...dateDep,
      ...fetchDep,
      ...(createE2eSparkWalletDep() ?? createSparkWalletDep()),
      ...createYadioApiDep(),
      ...createSwitchioTerminalDep(),
      ...createEetApiDep({ ...dateDep, ...fetchDep }),
      ...createNostrDep(),
    }
  }, [account.masterKey, console, deviceEvolu, evolu])
}

export const useAppRun = () => {
  const appRunDeps = useAppRunDeps()
  return useMemo(() => () => createRun(appRunDeps()), [appRunDeps])
}

/**
 * `useAppRun` plus the shared Cashu wallet (`cashuShardStore`, `cashuWallet`),
 * for the Cashu actions only: `await using run = await cashuAppRun()`. The
 * Cashu atoms are read when a run is made, never while rendering, so a
 * wallet that fails to start, or never does, holds up no screen; the call
 * that needed it rejects instead.
 */
export const useCashuAppRun = () => {
  const appRunDeps = useAppRunDeps()
  const jotaiStore = useStore()
  return useCallback(async () => {
    const [cashuShardStore, cashuWalletDep] = await Promise.all([
      jotaiStore.get(cashuShardStoreAtom),
      jotaiStore.get(cashuWalletDepAtom),
    ])
    return createRun({ ...appRunDeps(), cashuShardStore, ...cashuWalletDep })
  }, [appRunDeps, jotaiStore])
}
