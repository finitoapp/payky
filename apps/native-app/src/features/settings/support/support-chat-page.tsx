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
import { Text, XStack, YStack } from "tamagui"
import { AppButton } from "../../../components/app-button.tsx"
import { Screen } from "../../../components/screen.tsx"
import { ScreenHeader } from "../../../components/screen-header.tsx"
import { LoadingView } from "../../../components/state-views.tsx"
import {
  useNostrIdentity,
  useNostrMemberProfile,
} from "../../../hooks/use-nostr-profile.ts"
import { useLocale, useTranslation } from "../../../hooks/use-translation.ts"
import { WarningPanel } from "../../shared/warning-panel.tsx"
import {
  useDmInbox,
  useSupportMessages,
  useSupportTeam,
} from "./use-support-chat.ts"

/**
 * A group chat with the support team Payky's API serves (support/0001): the
 * conversation, newest at the bottom. New messages arrive live while it is
 * open; there is no unread state and no push.
 */
export function SupportChatPage() {
  const { t } = useTranslation()
  const { pubkey } = useNostrIdentity()
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
  const entries: ReadonlyArray<ChatEntry> = toChatEntries(messages.data ?? [])
  const loading =
    failure === null &&
    (team.isPending || inbox.isPending || messages.isPending)
  const reloading = team.isFetching || inbox.isFetching || messages.isFetching
  const timeline = buildTimeline(entries)

  return (
    <Screen>
      <ScreenHeader title={t("settings.supportChat.title")} />
      {failure === null ? null : (
        <WarningPanel title={t(failure)}>
          <AppButton
            label={t("settings.supportChat.retry")}
            variant="secondary"
            disabled={reloading}
            onPress={() => {
              void failedQuery.refetch()
            }}
          />
        </WarningPanel>
      )}
      {loading ? (
        <LoadingView />
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
            />
          ))}
        </YStack>
      )}
    </Screen>
  )
}

function TimelineRow({
  item,
  indexerRelays,
}: {
  readonly item: TimelineItem
  readonly indexerRelays: ReadonlyArray<string> | undefined
}) {
  const locale = useLocale()
  if (item.kind === "day") {
    return (
      <Text
        self="center"
        my="2"
        fontSize={12}
        fontWeight="600"
        color="muted-foreground"
      >
        {new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(
          item.date
        )}
      </Text>
    )
  }
  return <MessageBubble {...item} indexerRelays={indexerRelays} />
}

function MessageBubble({
  entry,
  firstOfGroup,
  indexerRelays,
}: Extract<TimelineItem, { kind: "message" }> & {
  readonly indexerRelays: ReadonlyArray<string> | undefined
}) {
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
          {new Date(entry.sentAt * 1000).toLocaleTimeString(locale, {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </Text>
      </YStack>
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
