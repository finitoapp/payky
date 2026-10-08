import { useQuery } from "@tanstack/react-query"
import { useAtomValue } from "jotai"
import { useEffect, useMemo } from "react"

import { accountAtom } from "@/atoms/account.ts"
import { deviceEvoluAtom } from "@/atoms/device-evolu.ts"
import {
  accountListQuery,
  storableNostrPicture,
  updateAccountNostrPicture,
} from "@/core/evolu/device-account.ts"
import {
  fetchNostrProfile,
  getNostrIdentity,
  type NostrIdentity,
} from "@/core/integrations/nostr/nostr-client.ts"
import { useAppRun } from "@/hooks/use-app-run.ts"
import { useDeviceEvoluQuery } from "@/hooks/use-device-evolu-query.ts"

/** The account's Nostr identity, derived from its recovery phrase. */
export const useNostrIdentity = (): NostrIdentity => {
  const { masterKey } = useAtomValue(accountAtom)
  return useMemo(() => getNostrIdentity(masterKey), [masterKey])
}

export const nostrProfileQueryKey = (pubkey: string) =>
  ["nostr", "profile", pubkey] as const

/**
 * A published kind-0 profile; errors when no relay answered. `extraRelays`
 * are read on top of the app's relays.
 */
export const useNostrProfile = (
  pubkey: string,
  extraRelays?: ReadonlyArray<string>
) => {
  const appRun = useAppRun()
  return useQuery({
    queryKey: nostrProfileQueryKey(pubkey),
    queryFn: async () => {
      await using run = appRun()
      const result = await run(fetchNostrProfile({ pubkey, extraRelays }))
      if (!result.ok) throw result.error
      return result.value
    },
    staleTime: 5 * 60_000,
  })
}

/**
 * The active account's profile. Whenever it loads, or a save replaces it,
 * its picture is remembered on the device account: that is how the account
 * list shows the other accounts' avatars without asking relays about them,
 * which would let a relay link the accounts (account/0004).
 */
export const useActiveNostrProfile = () => {
  const identity = useNostrIdentity()
  const profile = useNostrProfile(identity.pubkey)
  const account = useAtomValue(accountAtom)
  const deviceEvolu = useAtomValue(deviceEvoluAtom)
  const { data: accounts } = useDeviceEvoluQuery(accountListQuery)
  const stored = accounts.find(({ id }) => id === account.id)?.nostrPicture
  const picture =
    profile.data === undefined
      ? undefined
      : storableNostrPicture(profile.data.picture)

  useEffect(() => {
    // Written only on a change, so mounting it does not add a write.
    if (picture === undefined || stored === undefined || picture === stored) {
      return
    }
    updateAccountNostrPicture(deviceEvolu, account.id, picture)
  }, [account.id, deviceEvolu, picture, stored])

  return profile
}
