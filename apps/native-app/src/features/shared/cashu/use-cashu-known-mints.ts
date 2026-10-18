import { loadKnownCashuMints } from "@payky/core/cashu/cashu-mints"
import { cashuDeviceKnownMintsQuery } from "@payky/core/evolu/device-cashu"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useAtomValue } from "jotai"
import { useEffect } from "react"
import { accountAtom } from "../../../atoms/account.ts"
import { cashuShardStoreAtom } from "../../../atoms/cashu.ts"
import { deviceEvoluAtom } from "../../../atoms/device-evolu.ts"
import { subscribeToCashuWalletSnapshot } from "./cashu-wallet-snapshot-subscription.ts"

/** Known mints from the Linky wallet and this device, scoped to both accounts. */
export function useCashuKnownMints() {
  const account = useAtomValue(accountAtom)
  const deviceEvolu = useAtomValue(deviceEvoluAtom)
  const store = useAtomValue(cashuShardStoreAtom)
  const queryClient = useQueryClient()
  const queryKey = ["cashuKnownMints", store.linkyAppOwner.id, account.id]
  const query = useQuery({
    queryKey,
    queryFn: () =>
      loadKnownCashuMints({
        store,
        deviceEvolu,
        deviceAccountId: account.id,
      }),
  })
  const { refetch } = query

  useEffect(() => {
    const deviceMintsQuery = cashuDeviceKnownMintsQuery(account.id)
    return subscribeToCashuWalletSnapshot(
      store,
      queryClient,
      ["cashuKnownMints", store.linkyAppOwner.id, account.id],
      refetch,
      (listener) => deviceEvolu.subscribeQuery(deviceMintsQuery)(listener)
    ).dispose
  }, [store, deviceEvolu, account.id, queryClient, refetch])

  return query
}
