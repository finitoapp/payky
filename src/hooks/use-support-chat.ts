import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useAtomValue } from "jotai"
import { useEffect, useState } from "react"

import { accountAtom } from "@/atoms/account.ts"
import { createDateDep } from "@/core/deps.ts"
import { createNostrDep } from "@/core/integrations/nostr/nostr-client.ts"
import {
  type DmInbox,
  fetchSupportMessages,
  loadDmInbox,
  mergeSupportMessages,
  publishDmRelayList,
  type SupportMessage,
  type SupportTeam,
  subscribeSupportMessages,
} from "@/core/integrations/nostr/nostr-support-chat.ts"
import { fetchSupportTeam } from "@/core/integrations/nostr/support-team-client.ts"
import { useAppRun } from "@/hooks/use-app-run.ts"
import { useRunToast } from "@/hooks/use-run-toast.ts"

export const supportMessagesQueryKey = (pubkey: string) =>
  ["nostr", "support", pubkey] as const

export const dmInboxQueryKey = (pubkey: string) =>
  ["nostr", "dmInbox", pubkey] as const

/** How long to wait before listening again after every relay dropped. */
const RESUBSCRIBE_DELAY_MS = 5_000

/**
 * The support team from Payky's API. No fallback: the chat waits for it, and
 * shows a retry when it does not come (support/0001).
 */
export const useSupportTeam = () => {
  const appRun = useAppRun()
  return useQuery({
    queryKey: ["supportTeam"],
    queryFn: async () => {
      await using run = appRun()
      const result = await run(fetchSupportTeam())
      if (!result.ok) throw result.error
      return result.value
    },
    // The endpoint is cached for as long.
    staleTime: 5 * 60_000,
    retry: 1,
  })
}

/** The account's DM inbox, which says where support's replies arrive. */
export const useDmInbox = ({
  pubkey,
  team,
}: {
  readonly pubkey: string
  readonly team: SupportTeam | undefined
}) => {
  const appRun = useAppRun()
  return useQuery({
    queryKey: dmInboxQueryKey(pubkey),
    enabled: team !== undefined,
    queryFn: async () => {
      if (team === undefined) throw new Error("The support team is not loaded.")
      await using run = appRun()
      return await run.ok(loadDmInbox({ team }))
    },
    staleTime: 5 * 60_000,
  })
}

/**
 * Publishes the account's DM relay list (support/0001) and remembers whether
 * the last attempt failed, which the chat warns about. A published list is
 * written into the inbox's cache: relays may not serve it back yet.
 */
export const usePublishDmRelayList = ({
  pubkey,
  team,
}: {
  readonly pubkey: string
  readonly team: SupportTeam | undefined
}) => {
  const runToast = useRunToast()
  const queryClient = useQueryClient()
  const [failed, setFailed] = useState(false)

  const publish = async () => {
    if (team === undefined) return
    const outcome = { published: false }
    await runToast(async (run) => {
      const result = await run(publishDmRelayList({ team }))
      // A rejection is shown by the chat's warning, not a toast.
      outcome.published = result.ok
    })
    setFailed(!outcome.published)
    if (outcome.published) {
      queryClient.setQueryData(dmInboxQueryKey(pubkey), {
        relays: team.relays,
        state: "found",
      } satisfies DmInbox)
    }
  }

  return { publish, failed }
}

/**
 * The conversation with support while the chat is open: the history through
 * `useQuery`, and a live subscription that writes each new message into the
 * same cache the moment a relay pushes it. Both wait for the team and the
 * DM inbox, which say where to read. Refetching on focus and on reconnect
 * (TanStack's defaults) covers what the subscription misses while a
 * backgrounded WebView has its sockets closed. Nothing listens once the chat is closed.
 */
export const useSupportMessages = ({
  pubkey,
  team,
  inbox,
}: {
  readonly pubkey: string
  readonly team: SupportTeam | undefined
  readonly inbox: DmInbox | undefined
}) => {
  const appRun = useAppRun()
  const queryClient = useQueryClient()
  const { masterKey } = useAtomValue(accountAtom)
  const queryKey = supportMessagesQueryKey(pubkey)

  useEffect(() => {
    if (team === undefined || inbox === undefined) return
    const key = supportMessagesQueryKey(pubkey)
    const add = (message: SupportMessage) =>
      queryClient.setQueryData(
        key,
        (current: ReadonlyArray<SupportMessage> | undefined) =>
          mergeSupportMessages(current, [message])
      )

    let close = () => {}
    let retry: ReturnType<typeof setTimeout> | undefined
    const listen = () => {
      close = subscribeSupportMessages(
        { ...createNostrDep(), ...createDateDep(), masterKey },
        {
          team,
          inbox,
          onMessage: add,
          // Every relay dropped it: catch up on the history, listen again.
          onClose: () => {
            retry = setTimeout(() => {
              void queryClient.invalidateQueries({ queryKey: key })
              listen()
            }, RESUBSCRIBE_DELAY_MS)
          },
        }
      )
    }
    listen()

    return () => {
      clearTimeout(retry)
      close()
    }
  }, [inbox, masterKey, pubkey, queryClient, team])

  return useQuery({
    queryKey,
    enabled: team !== undefined && inbox !== undefined,
    queryFn: async () => {
      if (team === undefined || inbox === undefined) {
        throw new Error("The support team or the DM inbox is not loaded.")
      }
      await using run = appRun()
      const result = await run(fetchSupportMessages({ team, inbox }))
      if (!result.ok) throw result.error
      // Merged rather than replaced: a message pushed live or just sent may
      // not be in what the relays answered yet.
      return mergeSupportMessages(
        queryClient.getQueryData<ReadonlyArray<SupportMessage>>(queryKey),
        result.value
      )
    },
    // A safety net for a relay that dropped the subscription on its own while
    // the others kept it, which `onClose` does not report.
    refetchInterval: 2 * 60_000,
  })
}
