import { err, ok, type Task } from "@evolu/common"
import {
  DirectMessageRelaysList,
  GiftWrap,
  PrivateDirectMessage,
  Seal,
} from "nostr-tools/kinds"
import { decrypt, getConversationKey } from "nostr-tools/nip44"
import { createRumor, createSeal, createWrap } from "nostr-tools/nip59"
import {
  type Event,
  type EventTemplate,
  finalizeEvent,
  getEventHash,
  getPublicKey,
  type VerifiedEvent,
  verifyEvent,
} from "nostr-tools/pure"
import { normalizeURL } from "nostr-tools/utils"
import { z } from "zod"

import type { DateDep, MasterKeyDep } from "@/core/deps.ts"
import { defineError } from "@/core/error.ts"
import {
  createNostrRelaysUnreachableError,
  isAnyRelayConnected,
  isPublishAccepted,
  type NostrDep,
  type NostrRelaysUnreachableError,
  publishReasons,
  RELAY_MAX_WAIT_MS,
} from "@/core/integrations/nostr/nostr-client.ts"
import {
  deriveNostrSecretKey,
  type NostrSecretKey,
} from "@/core/modules/shared/key-derivation.ts"

/**
 * The support chat is one NIP-17 group per account: the account's own Nostr
 * key plus every support npub Payky's API serves (support/0001). NIP-17 names a
 * room by the set of its members, so each account gets its own room on the
 * support side, a reply from one member reaches all, and that set is also
 * what tells the chat apart from the account's other DMs.
 */

/**
 * The support team, as Payky's API serves it: who the group is with and
 * where it meets. Pubkeys are hex.
 */
export interface SupportTeam {
  /** Who every message goes to. */
  readonly pubkeys: ReadonlyArray<string>
  /**
   * Every earlier line-up. A changed team is a new NIP-17 room, and these
   * keep the old rooms' messages in the chat.
   */
  readonly formerTeams: ReadonlyArray<ReadonlyArray<string>>
  /** Where every copy goes and the chat reads; each member lists one. */
  readonly relays: ReadonlyArray<string>
  /** Read only: the team's profiles and the account's DM relay list. */
  readonly indexerRelays: ReadonlyArray<string>
}

/** Where Amethyst delivers the account's DMs: its kind 10050 relays. */
export interface DmInbox {
  readonly relays: ReadonlyArray<string>
  /**
   * True only when every relay asked answered in time and none holds a
   * list: then the account has none, and one may be published without
   * overwriting Linky's.
   */
  readonly listMissing: boolean
}

export interface SupportMessage {
  /** The rumor id, the same in every member's copy. */
  readonly id: string
  /** Hex pubkey of the author. */
  readonly author: string
  readonly fromSupport: boolean
  readonly text: string
  /** Unix seconds, from the rumor; the wraps' own times are randomized. */
  readonly sentAt: number
}

/** What the support team sees under each message (support/0001). */
export interface SupportClientInfo {
  readonly version: string
  readonly platform: string
}

const trailerPattern = /\n\n— Payky \S+ · \S+$/u

export const appendClientTrailer = (
  text: string,
  { version, platform }: SupportClientInfo
): string => `${text}\n\n— Payky ${version} · ${platform}`

/** The account's own message as typed, without the trailer it was sent with. */
export const stripClientTrailer = (text: string): string =>
  text.replace(trailerPattern, "")

const EventSchema = z.object({
  id: z.string(),
  pubkey: z.string(),
  created_at: z.number().int(),
  kind: z.number().int(),
  tags: z.array(z.array(z.string())),
  content: z.string(),
})
const SealSchema = EventSchema.extend({ sig: z.string() })

const decryptJson = (
  payload: string,
  secretKey: NostrSecretKey,
  pubkey: string
): unknown =>
  JSON.parse(decrypt(payload, getConversationKey(secretKey, pubkey)))

const pTagValues = (tags: ReadonlyArray<ReadonlyArray<string>>) =>
  tags.flatMap(([name, value]) =>
    name === "p" && value !== undefined ? [value] : []
  )

/**
 * A gift wrap addressed to the account, as a support chat message — or
 * `null`. nostr-tools' `unwrapEvent` checks nothing, so this verifies the
 * seal's signature, that the seal and the rumor share their author and that
 * the rumor's id is its hash: without that anyone could post a message "from
 * support" asking for the recovery phrase. A message belongs to the chat when
 * its room — the author and every `p` tag — is exactly the account plus the
 * team, current or former: the account's other DMs, from Linky for one, share
 * the key, and a 1:1 with a single member of a larger team is not the
 * support room.
 */
export const decodeSupportWrap = ({
  wrap,
  secretKey,
  team,
}: {
  readonly wrap: Event
  readonly secretKey: NostrSecretKey
  readonly team: SupportTeam
}): SupportMessage | null => {
  if (wrap.kind !== GiftWrap) return null
  try {
    const seal = SealSchema.safeParse(
      decryptJson(wrap.content, secretKey, wrap.pubkey)
    )
    if (!seal.success || seal.data.kind !== Seal || !verifyEvent(seal.data)) {
      return null
    }
    const parsed = EventSchema.safeParse(
      decryptJson(seal.data.content, secretKey, seal.data.pubkey)
    )
    if (!parsed.success) return null
    const rumor = parsed.data
    if (
      rumor.kind !== PrivateDirectMessage ||
      rumor.pubkey !== seal.data.pubkey ||
      getEventHash(rumor) !== rumor.id
    ) {
      return null
    }

    const me = getPublicKey(secretKey)
    const room = new Set([rumor.pubkey, ...pTagValues(rumor.tags)])
    const isSupportRoom = [team.pubkeys, ...team.formerTeams].some((lineUp) => {
      const supportRoom = new Set([me, ...lineUp])
      return (
        room.size === supportRoom.size &&
        [...supportRoom].every((pubkey) => room.has(pubkey))
      )
    })
    if (!isSupportRoom) return null
    // The room holds only the account and support, so anyone else wrote it
    // from support.
    const fromSupport = rumor.pubkey !== me

    return {
      id: rumor.id,
      author: rumor.pubkey,
      fromSupport,
      text: fromSupport ? rumor.content : stripClientTrailer(rumor.content),
      sentAt: rumor.created_at,
    }
  } catch {
    // Not encrypted to this key, or not JSON inside.
    return null
  }
}

/**
 * Every event `relays` hold for `filter`. Relays that keep gift wraps private
 * ask for NIP-42 AUTH, answered with the account's key.
 */
const queryWithAuth = (
  pool: NostrDep["nostr"]["pool"],
  relays: ReadonlyArray<string>,
  filter: Parameters<NostrDep["nostr"]["pool"]["subscribeManyEose"]>[1],
  secretKey: NostrSecretKey
): Promise<ReadonlyArray<Event>> =>
  new Promise((resolve) => {
    const events: Event[] = []
    pool.subscribeManyEose([...relays], filter, {
      maxWait: RELAY_MAX_WAIT_MS,
      onevent: (event) => events.push(event),
      onclose: () => resolve(events),
      onauth: authSigner(secretKey),
    })
  })

const authSigner =
  (secretKey: NostrSecretKey) =>
  async (template: EventTemplate): Promise<VerifiedEvent> =>
    finalizeEvent(template, secretKey)

const unique = (relays: ReadonlyArray<string>): ReadonlyArray<string> => [
  ...new Set(relays),
]

/** Where the chat reads: the team's relays and the account's DM inbox. */
const readRelays = (team: SupportTeam, inbox: DmInbox) =>
  unique([...team.relays, ...inbox.relays])

/**
 * The account's kind 10050 relays, looked up wherever it may live. The list
 * is Linky's as much as Payky's, so it is only ever read here; `listMissing`
 * is what allows `sendSupportMessage` to publish one for an account that has
 * none. nostr-tools reports a relay that timed out like one that answered,
 * so "every relay answered" is read off the clock and the sockets: the query
 * ended before the timeout, and every relay asked is connected.
 */
export const loadDmInbox =
  ({
    team,
  }: {
    readonly team: SupportTeam
  }): Task<DmInbox, never, NostrDep & MasterKeyDep & DateDep> =>
  async (run) => {
    const { nostr, date } = run.deps
    const secretKey = deriveNostrSecretKey(run.deps.masterKey)
    const asked = unique([
      ...nostr.relays,
      ...team.indexerRelays,
      ...team.relays,
    ])
    const startedAt = date.now().getTime()
    const lists = await queryWithAuth(
      nostr.pool,
      asked,
      {
        kinds: [DirectMessageRelaysList],
        authors: [getPublicKey(secretKey)],
      },
      secretKey
    )
    const newest = lists.reduce<Event | undefined>(
      (current, list) =>
        current === undefined || current.created_at < list.created_at
          ? list
          : current,
      undefined
    )
    if (newest !== undefined) {
      return ok({
        relays: newest.tags.flatMap(([name, url]) =>
          name === "relay" && url?.startsWith("wss://") === true ? [url] : []
        ),
        listMissing: false,
      })
    }

    const status = nostr.pool.listConnectionStatus()
    const everyRelayAnswered =
      date.now().getTime() - startedAt < RELAY_MAX_WAIT_MS &&
      asked.every((relay) => status.get(normalizeURL(relay)) === true)
    return ok({ relays: [], listMissing: everyRelayAnswered })
  }

/** How far back NIP-59 may date a gift wrap, so how far back to listen. */
const WRAP_BACKDATE_SECONDS = 2 * 24 * 60 * 60

/** How much of the conversation is loaded when the chat opens. */
const HISTORY_SECONDS = 90 * 24 * 60 * 60

/**
 * The last ninety days of the conversation, oldest first, from the team's
 * relays and the account's DM inbox. Every DM to the account comes back
 * here, Linky's included, and only decrypting a wrap tells whose it is, so
 * the window keeps the cost of opening the chat bounded; the extra two days
 * cover a wrap's backdated `created_at`.
 */
export const fetchSupportMessages =
  ({
    team,
    inbox,
  }: {
    readonly team: SupportTeam
    readonly inbox: DmInbox
  }): Task<
    ReadonlyArray<SupportMessage>,
    NostrRelaysUnreachableError,
    NostrDep & MasterKeyDep & DateDep
  > =>
  async (run) => {
    const { nostr } = run.deps
    const secretKey = deriveNostrSecretKey(run.deps.masterKey)
    const now = Math.floor(run.deps.date.now().getTime() / 1000)
    const relays = readRelays(team, inbox)
    const wraps = await queryWithAuth(
      nostr.pool,
      relays,
      {
        kinds: [GiftWrap],
        "#p": [getPublicKey(secretKey)],
        since: now - HISTORY_SECONDS - WRAP_BACKDATE_SECONDS,
      },
      secretKey
    )
    if (wraps.length === 0 && !isAnyRelayConnected(nostr.pool, relays)) {
      return err(createNostrRelaysUnreachableError())
    }

    return ok(
      mergeSupportMessages(
        [],
        wraps.flatMap((wrap) => {
          const message = decodeSupportWrap({
            wrap,
            secretKey,
            team,
          })
          return message === null ? [] : [message]
        })
      )
    )
  }

/**
 * `current` with `incoming` added, oldest first, each message once: the
 * history, the live subscription and a send all deliver the same rumor ids.
 * Nothing is ever removed, so a read that missed a message cannot drop it.
 */
export const mergeSupportMessages = (
  current: ReadonlyArray<SupportMessage> | undefined,
  incoming: ReadonlyArray<SupportMessage>
): ReadonlyArray<SupportMessage> =>
  // A stable sort on purpose: times are whole seconds, so messages sent
  // within one keep the order they arrived in rather than an id's random one.
  [
    ...new Map(
      [...(current ?? []), ...incoming].map((message) => [message.id, message])
    ).values(),
  ].sort((a, b) => a.sentAt - b.sentAt)

/**
 * Listens for new messages while the chat is open: relays push each matching
 * wrap the moment they store it. `since` reaches two days back because a
 * fresh wrap carries a randomized past `created_at`; whatever that replays is
 * deduplicated by `mergeSupportMessages`. `onClose` fires once every relay
 * has dropped the subscription (the shared pool does not resubscribe: its
 * reconnect moves `since` past the newest wrap and would skip backdated
 * ones). Returns the function that ends it, which does not call `onClose`.
 */
export const subscribeSupportMessages = (
  { nostr, masterKey, date }: NostrDep & MasterKeyDep & DateDep,
  {
    team,
    inbox,
    onMessage,
    onClose,
  }: {
    readonly team: SupportTeam
    readonly inbox: DmInbox
    readonly onMessage: (message: SupportMessage) => void
    readonly onClose: () => void
  }
): (() => void) => {
  const secretKey = deriveNostrSecretKey(masterKey)
  let closedByCaller = false
  const subscription = nostr.pool.subscribeMany(
    [...readRelays(team, inbox)],
    {
      kinds: [GiftWrap],
      "#p": [getPublicKey(secretKey)],
      since: Math.floor(date.now().getTime() / 1000) - WRAP_BACKDATE_SECONDS,
    },
    {
      onevent: (wrap) => {
        const message = decodeSupportWrap({
          wrap,
          secretKey,
          team,
        })
        if (message !== null) onMessage(message)
      },
      onclose: () => {
        if (!closedByCaller) onClose()
      },
      onauth: authSigner(secretKey),
    }
  )
  return () => {
    closedByCaller = true
    subscription.close()
  }
}

const createSupportNotReachedError = defineError("SupportNotReachedError")<{
  readonly reasons: ReadonlyArray<string>
}>()
export type SupportNotReachedError = ReturnType<
  typeof createSupportNotReachedError
>

/**
 * Sends `text` to every support member at once, as one rumor carrying all of
 * their `p` tags (nostr-tools' `nip17.wrapManyEvents` would tag each copy
 * with one recipient only, splitting the group into 1:1 chats). Every copy
 * goes to the team's relays, which each member lists as a DM relay, so the
 * members' own lists are never looked up. Amethyst delivers the replies to
 * the account's DM inbox; an account without one gets a list naming the
 * team's relays, and an existing list — Linky's too — is never changed.
 * Ok once a relay accepted a copy for support: the account's own copy alone
 * reaches nobody, so it is published only then. A message in the history is
 * therefore one a relay accepted for support, which is what its tick says.
 */
export const sendSupportMessage =
  ({
    text,
    subject,
    client,
    team,
    inbox,
  }: {
    readonly text: string
    /** The group's name in Amethyst. */
    readonly subject: string
    readonly client: SupportClientInfo
    readonly team: SupportTeam
    readonly inbox: DmInbox
  }): Task<
    SupportMessage,
    SupportNotReachedError,
    NostrDep & MasterKeyDep & DateDep
  > =>
  async (run) => {
    const { nostr } = run.deps
    const secretKey = deriveNostrSecretKey(run.deps.masterKey)
    const me = getPublicKey(secretKey)
    const now = Math.floor(run.deps.date.now().getTime() / 1000)
    const publish = (relays: ReadonlyArray<string>, event: Event) =>
      Promise.allSettled(
        nostr.pool.publish([...relays], event, {
          maxWait: RELAY_MAX_WAIT_MS,
          onauth: authSigner(secretKey),
        })
      )

    if (inbox.listMissing) {
      void publish(
        team.relays,
        finalizeEvent(
          {
            kind: DirectMessageRelaysList,
            created_at: now,
            tags: team.relays.map((relay) => ["relay", relay]),
            content: "",
          },
          secretKey
        )
      )
    }

    const rumor = createRumor(
      {
        kind: PrivateDirectMessage,
        created_at: now,
        content: appendClientTrailer(text, client),
        tags: [
          ...team.pubkeys.map((pubkey) => ["p", pubkey]),
          ["subject", subject],
        ],
      },
      secretKey
    )
    const wrapFor = (pubkey: string) =>
      createWrap(createSeal(rumor, secretKey, pubkey), pubkey)

    const results = (
      await Promise.all(
        team.pubkeys.map((pubkey) => publish(team.relays, wrapFor(pubkey)))
      )
    ).flat()
    if (!isPublishAccepted(results)) {
      return err(
        createSupportNotReachedError({ reasons: publishReasons(results) })
      )
    }
    // Not awaited: support has the message, and the send resolves before the
    // own copy comes back over the live subscription, so the two meet in
    // `mergeSupportMessages` by id instead of showing twice. It goes where
    // the chat and Linky read.
    // ponytail: a lost own copy still counts as sent but is missing from the
    // history after a reload; retry it if that shows up.
    void publish(readRelays(team, inbox), wrapFor(me))

    return ok({
      id: rumor.id,
      author: me,
      fromSupport: false,
      text,
      sentAt: now,
    })
  }
