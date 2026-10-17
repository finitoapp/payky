import { err } from "@evolu/common"
import { lockManager } from "@evolu/react-native"
import { createDateDep } from "@payky/core/deps"
import { createEetApiDep } from "@payky/core/integrations/eet/eet-client"
import { createNostrDep } from "@payky/core/integrations/nostr/nostr-client"
import { createYadioApiDep } from "@payky/core/integrations/yadio/yadio-client"
import { createSparkWalletDep } from "@payky/core/spark/spark-wallet"
import {
  createSwitchioUnavailableError,
  type SwitchioTerminalDep,
} from "@payky/core/switchio"
import { useAtomValue } from "jotai"
import { useCallback } from "react"
import { accountAtom } from "../atoms/account.ts"
import { deviceEvoluAtom } from "../atoms/device-evolu.ts"
import { evoluAtom } from "../atoms/evolu.ts"
import { nativeEnv } from "../core/native-env.ts"
import { nativeConsole, nativeRun } from "../core/native-runtime.ts"
import { createFetchDep } from "../platform/native-deps.ts"

/**
 * Native has no SwitchioPay bridge yet (its ECR protocol is Android-intent
 * only), so the dep answers with the domain's own "unavailable" error, which
 * `payPaymentWithSwitchioCard` already maps to a message. The card tab is not
 * offered natively until a plugin exists; this only keeps the dep list equal
 * to web's.
 */
const unsupportedSwitchioTerminalDep: SwitchioTerminalDep = {
  switchioTerminal: {
    pay: async () =>
      err(createSwitchioUnavailableError({ reason: "notInstalled" })),
  },
}

/**
 * Native composition root for Task actions, the counterpart of web's
 * `useAppRun`: the same dependency set (console, evolu, deviceEvolu,
 * evoluOwner, masterKey, lockManager, date, fetch, sparkWallet, yadioApi,
 * switchioTerminal, eetApi, nostr), built fresh for each run. Use as
 * `await using run = appRun()`. The Cashu wallet arrives with P08.
 */
export function useAppRun() {
  const evolu = useAtomValue(evoluAtom)
  const deviceEvolu = useAtomValue(deviceEvoluAtom)
  const account = useAtomValue(accountAtom)

  return useCallback(() => {
    const dateDep = createDateDep()
    const fetchDep = createFetchDep()
    return nativeRun.create({
      console: nativeConsole,
      evolu,
      deviceEvolu,
      evoluOwner: evolu.appOwner,
      masterKey: account.masterKey,
      lockManager,
      ...dateDep,
      ...fetchDep,
      ...createSparkWalletDep(),
      ...createYadioApiDep(),
      ...unsupportedSwitchioTerminalDep,
      ...createEetApiDep(
        { ...dateDep, ...fetchDep },
        { productionUrl: nativeEnv.EXPO_PUBLIC_PAYKY_EET_PRODUCTION_URL }
      ),
      ...createNostrDep(nativeEnv.EXPO_PUBLIC_PAYKY_NOSTR_RELAYS),
    })
  }, [account.masterKey, deviceEvolu, evolu])
}

export type NativeAppRun = ReturnType<ReturnType<typeof useAppRun>>
