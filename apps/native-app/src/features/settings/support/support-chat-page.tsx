import { formatRelativeDate } from "@payky/app-shared/format-date"
import type { TranslationKey } from "@payky/app-shared/i18n/resources"
import { splitMentions } from "@payky/app-shared/support-chat-mentions"
import {
  buildTimeline,
  type ChatEntry,
  type TimelineItem,
  toChatEntries,
} from "@payky/app-shared/support-chat-timeline"
import { shortenNpub } from "@payky/core/integrations/nostr/nostr-client"
import { hexToNpub } from "@payky/core/integrations/nostr/npub"
import CircleAlert from "lucide-react-native/icons/circle-alert"
import { Text, XStack, YStack } from "tamagui"
import { FadeHeader } from "../../../components/fade-header.tsx"
import { Screen } from "../../../components/screen.tsx"
import {
  Alert,
  AlertAction,
  AlertDescription,
} from "../../../components/ui/alert.tsx"
import { Badge } from "../../../components/ui/badge.tsx"
import { Button } from "../../../components/ui/button.tsx"
import { Skeleton } from "../../../components/ui/skeleton.tsx"
import {
  useNostrIdentity,
  useNostrMemberProfile,
} from "../../../hooks/use-nostr-profile.ts"
import { useLocale, useTranslation } from "../../../hooks/use-translation.ts"
import { radius } from "../../../theme/tokens.ts"
import { ChatComposer } from "../../shared/chat-composer.tsx"
import { DmInboxWarning } from "./dm-inbox-warning.tsx"
import { useSendSupportMessage } from "./use-send-support-message.ts"
import {
  useDmInbox,
  usePublishDmRelayList,
  useSupportMessages,
  useSupportTeam,
} from "./use-support-chat.ts"

/**
 * A group chat with the support team Payky's API serves (support/0001): the
 * conversation, newest at the bottom. New messages arrive live while it is
 * open; there is no unread state and no push.
 */
export function SupportChatPage() {
  const { pubkey } = useNostrIdentity()
  // Keyed by the account, so a switch drops the open conversation, its
  // subscription and any unsent message instead of carrying them over.
  return <SupportChat key={pubkey} pubkey={pubkey} />
}

function SupportChat({ pubkey }: { readonly pubkey: string }) {
  const { t } = useTranslation()
  const team = useSupportTeam()
  const inbox = useDmInbox({ pubkey, team: team.data })
  const messages = useSupportMessages({
    pubkey,
    team: team.data,
    inbox: inbox.data,
  })
  // Without the team there is nobody to write to: the chat says so instead
  // of falling back to a list built into the app (support/0001).
  const failure: TranslationKey | null = team.isError
    ? "settings.supportChat.teamUnavailable"
    : inbox.isError || messages.isError
      ? "settings.supportChat.loadFailed"
      : null
  const failedQuery = team.isError ? team : inbox.isError ? inbox : messages
  const { pending, send, retry } = useSendSupportMessage({
    pubkey,
    team: team.data,
    inbox: inbox.data,
  })
  const dmRelayList = usePublishDmRelayList({ pubkey, team: team.data })
  // The first message of an account without a DM relay list publishes one
  // alongside it: until then support has nowhere to reply.
  const sendAndOpenReplies = async (text: string) => {
    await Promise.all([
      send(text),
      inbox.data?.state === "missing" ? dmRelayList.publish() : undefined,
    ])
  }
  const entries: ReadonlyArray<ChatEntry> = [
    ...toChatEntries(messages.data ?? []),
    ...pending,
  ]
  const loading =
    failure === null &&
    (team.isPending || inbox.isPending || messages.isPending)
  const reloading = team.isFetching || inbox.isFetching || messages.isFetching
  const timeline = buildTimeline(entries)

  return (
    <Screen
      // Web docks the composer card at the screen's edges, unframed.
      footer={
        <ChatComposer
          label={t("settings.supportChat.message.label")}
          placeholder={t("settings.supportChat.message.placeholder")}
          sendLabel={t("settings.supportChat.send")}
          disabled={team.data === undefined}
          onSend={(text) => {
            void sendAndOpenReplies(text)
          }}
        />
      }
    >
      <FadeHeader title={t("settings.supportChat.title")} />
      {failure === null ? null : (
        <Alert variant="destructive" icon={CircleAlert}>
          <AlertDescription>{t(failure)}</AlertDescription>
          <AlertAction>
            <Button
              label={t("settings.supportChat.retry")}
              variant="outline"
              size="sm"
              disabled={reloading}
              onPress={() => {
                void failedQuery.refetch()
              }}
            />
          </AlertAction>
        </Alert>
      )}
      {loading ? (
        <YStack gap="2" mt="auto" accessibilityElementsHidden>
          <Skeleton h={40} w="67%" rounded={radius["2xl"]} />
          <Skeleton h={56} w="50%" self="flex-end" rounded={radius["2xl"]} />
          <Skeleton h={40} w="60%" rounded={radius["2xl"]} />
        </YStack>
      ) : timeline.length === 0 && failure === null ? (
        <Text color="muted-foreground" text="center">
          {t("settings.supportChat.empty")}
        </Text>
      ) : (
        <YStack accessibilityLiveRegion="polite">
          {timeline.map((item) => (
            <TimelineRow
              key={item.key}
              item={item}
              indexerRelays={team.data?.indexerRelays}
              onRetry={retry}
            />
          ))}
        </YStack>
      )}
      {inbox.data?.state === "unverified" || dmRelayList.failed ? (
        <DmInboxWarning
          unverified={inbox.data?.state === "unverified"}
          publishFailed={dmRelayList.failed}
          onVerify={async () => {
            const { data } = await inbox.refetch()
            if (data?.state === "missing") await dmRelayList.publish()
          }}
          onPublish={dmRelayList.publish}
        />
      ) : null}
    </Screen>
  )
}

function TimelineRow({
  item,
  indexerRelays,
  onRetry,
}: {
  readonly item: TimelineItem
  readonly indexerRelays: ReadonlyArray<string> | undefined
  readonly onRetry: (entry: ChatEntry) => void
}) {
  const locale = useLocale()
  if (item.kind === "day") {
    return (
      <YStack self="center" my="2">
        <Badge
          variant="secondary"
          label={formatRelativeDate(item.date, new Date(), locale)}
        />
      </YStack>
    )
  }
  return (
    <MessageBubble {...item} indexerRelays={indexerRelays} onRetry={onRetry} />
  )
}

function MessageBubble({
  entry,
  firstOfGroup,
  indexerRelays,
  onRetry,
}: Extract<TimelineItem, { kind: "message" }> & {
  readonly indexerRelays: ReadonlyArray<string> | undefined
  readonly onRetry: (entry: ChatEntry) => void
}) {
  const { t } = useTranslation()
  const locale = useLocale()
  const own = !entry.fromSupport

  return (
    <YStack
      maxW="85%"
      self={own ? "flex-end" : "flex-start"}
      mt={firstOfGroup ? 12 : 4}
      gap="1"
      items={own ? "flex-end" : "flex-start"}
    >
      {!own && firstOfGroup ? (
        <SupportAuthor pubkey={entry.author} indexerRelays={indexerRelays} />
      ) : null}
      <YStack
        px="3"
        py="2"
        rounded="xl"
        bg={own ? "primary" : "background"}
        borderWidth={own ? 0 : 1}
        borderColor="border-color"
      >
        <Text color={own ? "primary-foreground" : "color"}>
          <MessageText
            text={entry.text}
            own={own}
            indexerRelays={indexerRelays}
          />
        </Text>
        <Text
          fontSize={11}
          color={own ? "primary-foreground" : "muted-foreground"}
          self="flex-end"
        >
          {`${new Date(entry.sentAt * 1000).toLocaleTimeString(locale, {
            hour: "2-digit",
            minute: "2-digit",
          })}${
            own && entry.status === "sending"
              ? ` · ${t("settings.supportChat.sending")}`
              : own && entry.status === "sent"
                ? ` · ✓ ${t("settings.supportChat.sent")}`
                : ""
          }`}
        </Text>
      </YStack>
      {entry.status === "failed" ? (
        <Button
          size="xs"
          labelColor="destructive"
          label={t("settings.supportChat.notDelivered")}
          variant="ghost"
          onPress={() => onRetry(entry)}
        />
      ) : null}
      {/* Reactions sit under the bubble: the first emoji of each, once. */}
      {entry.reactions.length > 0 ? (
        <XStack px="2">
          <Text>{entry.reactions.join(" ")}</Text>
        </XStack>
      ) : null}
    </YStack>
  )
}

function SupportAuthor({
  pubkey,
  indexerRelays,
}: {
  readonly pubkey: string
  readonly indexerRelays: ReadonlyArray<string> | undefined
}) {
  const profile = useNostrMemberProfile(pubkey, indexerRelays)
  return (
    <Text fontSize={12} fontWeight="600" color="muted-foreground">
      {profile.data?.name ?? shortenNpub(hexToNpub(pubkey))}
    </Text>
  )
}

/** A message, with the accounts it mentions shown by name. */
function MessageText({
  text,
  own,
  indexerRelays,
}: {
  readonly text: string
  readonly own: boolean
  readonly indexerRelays: ReadonlyArray<string> | undefined
}) {
  let offset = 0
  return splitMentions(text).map((part) => {
    // Parts never move, so where one starts is a stable key.
    const key = offset
    offset += part.kind === "text" ? part.text.length : 1
    return part.kind === "text" ? (
      <Text key={key} color={own ? "primary-foreground" : "color"}>
        {part.text}
      </Text>
    ) : (
      <Mention key={key} pubkey={part.pubkey} indexerRelays={indexerRelays} />
    )
  })
}

/** A mentioned account by name, as other clients show it. */
function Mention({
  pubkey,
  indexerRelays,
}: {
  readonly pubkey: string
  readonly indexerRelays: ReadonlyArray<string> | undefined
}) {
  const profile = useNostrMemberProfile(pubkey, indexerRelays)
  return (
    <Text fontWeight="700">
      {`@${profile.data?.name ?? shortenNpub(hexToNpub(pubkey))}`}
    </Text>
  )
}
