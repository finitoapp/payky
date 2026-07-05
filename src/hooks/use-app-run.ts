import { createRun } from "@evolu/web"
import { useMemo } from "react"

import { createDateDep, createFetchDep } from "@/core/deps.ts"
import { createYadioApiDep } from "@/core/integrations/yadio/yadio-client.ts"
import { createSparkWalletDep } from "@/core/spark/spark-wallet.ts"
import { useConsole } from "@/hooks/use-console.ts"
import { useEvolu } from "@/hooks/use-evolu.ts"

/**
 * Composition root for running Task actions from React.
 *
 * Returns a stable factory that creates a disposable Run wired with the full
 * superset of app dependencies (console, evolu, evoluOwnerId, date, fetch,
 * sparkWallet, yadioApi). Task dependency typing is structural, so Tasks that
 * need only a subset are unaffected by the extra deps.
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

  return useMemo(() => {
    return () =>
      createRun({
        console,
        evolu,
        evoluOwnerId: evolu.appOwner.id,
        ...createDateDep(),
        ...createFetchDep(),
        ...createSparkWalletDep(),
        ...createYadioApiDep(),
      })
  }, [console, evolu])
}
