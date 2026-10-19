import { AbortError } from "@evolu/common"
import {
  type AssistantTurn,
  assistantConversationAtom,
  toAssistantMessages,
} from "@payky/app-shared/assistant-conversation"
import type { TranslationKey } from "@payky/app-shared/i18n/resources"
import { createAiModelDep } from "@payky/core/ai/ai-model"
import { askAssistant } from "@payky/core/ai/assistant"
import { createAssistantTools } from "@payky/core/ai/assistant-tools"
import type { AiAssistantAccess } from "@payky/core/evolu/device-client"
import { fetch as expoFetch } from "expo/fetch"
import Constants from "expo-constants"
import * as Crypto from "expo-crypto"
import { Redirect } from "expo-router"
import {
  atom,
  type PrimitiveAtom,
  useAtomValue,
  useSetAtom,
  useStore,
} from "jotai"
import { useEffect, useRef, useState } from "react"
import { Text, YStack } from "tamagui"
import { evoluAtom } from "../../../atoms/evolu.ts"
import { FadeHeader } from "../../../components/fade-header.tsx"
import { Screen } from "../../../components/screen.tsx"
import { Button } from "../../../components/ui/button.tsx"
import { apiUrl } from "../../../core/native-env.ts"
import { useAppRun } from "../../../hooks/use-app-run.ts"
import { useTranslation } from "../../../hooks/use-translation.ts"
import { ChatComposer } from "../../shared/chat-composer.tsx"
import { usePrivacySettings } from "../privacy/use-privacy-settings.ts"

/** What the assistant may read, as its empty state says and suggests. */
type Access = Exclude<AiAssistantAccess, "off">

const emptyKeys = {
  public: "settings.assistant.emptyPublic",
  all: "settings.assistant.empty",
} satisfies Record<Access, TranslationKey>

const suggestions = {
  public: [
    "settings.assistant.suggestion.howSplit",
    "settings.assistant.suggestion.howRefund",
  ],
  all: [
    "settings.assistant.suggestion.openBills",
    "settings.assistant.suggestion.latestPayments",
    "settings.assistant.suggestion.today",
    "settings.assistant.suggestion.howSplit",
  ],
} satisfies Record<Access, ReadonlyArray<TranslationKey>>

type LookingUp = "data" | "docs"

const lookingUpKeys = {
  data: "settings.assistant.lookingUp.data",
  docs: "settings.assistant.lookingUp.docs",
} satisfies Record<LookingUp, TranslationKey>

/** The reply being streamed in, and what a tool is reading for it. */
interface Answering {
  readonly text: string
  readonly lookingUp: LookingUp | null
}

/**
 * A chat with the assistant (ai/0004). It reads the merchant's local data
 * through its tools and answers through Payky's AI proxy. The conversation
 * stays in memory while the app runs; leaving the screen stops a reply that
 * is still coming. The assistant exists only on a device that allowed it
 * (ai/0004); anywhere else this sends the merchant to the privacy settings.
 */
export function AssistantChatPage() {
  const { aiAssistantAccess } = usePrivacySettings()
  if (aiAssistantAccess === "off") {
    return <Redirect href="/settings/about/privacy" />
  }
  return <AssistantChat access={aiAssistantAccess} />
}

function AssistantChat({ access }: { readonly access: Access }) {
  const { t } = useTranslation()
  const { turns, answeringAtom, ask, stop, startOver } =
    useAssistantConversation(access)
  const last = turns.at(-1)
  const answering = last?.status === "answering"

  return (
    <Screen>
      <FadeHeader title={t("settings.assistant.title")} />
      {turns.length === 0 ? null : (
        <Button
          size="lg"
          label={t("settings.assistant.newConversation")}
          variant="outline"
          onPress={startOver}
        />
      )}
      {turns.length === 0 ? (
        <EmptyConversation access={access} onAsk={ask} />
      ) : (
        <YStack gap="2" accessibilityLiveRegion="polite">
          {turns.map((turn) => (
            <Turn
              key={turn.id}
              turn={turn}
              answeringAtom={answeringAtom}
              onRetry={() => ask(turn.question, turn.id)}
            />
          ))}
        </YStack>
      )}
      <ChatComposer
        label={t("settings.assistant.message.label")}
        placeholder={t("settings.assistant.message.placeholder")}
        sendLabel={t("settings.assistant.send")}
        onSend={ask}
        disabled={false}
        stop={
          answering
            ? { label: t("settings.assistant.stop"), onStop: stop }
            : undefined
        }
      />
    </Screen>
  )
}

/**
 * The conversation of the active account and access, and asking within it.
 * A conversation held with another access starts afresh, so replies about the
 * merchant's data are not sent again (ai/0004). The reply being streamed
 * lives in a screen-scoped atom that only its bubble reads, so a token
 * re-renders that bubble rather than the whole conversation; it joins the
 * conversation once it is complete.
 */
function useAssistantConversation(access: Access) {
  const appRun = useAppRun()
  const store = useStore()
  const ownerId = useAtomValue(evoluAtom).appOwner.id
  const conversation = useAtomValue(assistantConversationAtom)
  const setConversation = useSetAtom(assistantConversationAtom)
  const isCurrent = (current: typeof conversation) =>
    current.ownerId === ownerId && current.access === access
  const turns = isCurrent(conversation) ? conversation.turns : []
  const [answeringAtom] = useState(() =>
    atom<Answering>({ text: "", lookingUp: null })
  )
  const fiber = useRef<{ readonly abort: () => void } | null>(null)

  // Leaving the screen stops the reply; what came so far stays.
  useEffect(() => () => fiber.current?.abort(), [])

  const updateTurns = (
    update: (
      turns: ReadonlyArray<AssistantTurn>
    ) => ReadonlyArray<AssistantTurn>
  ) =>
    setConversation((current) => ({
      ownerId,
      access,
      turns: update(isCurrent(current) ? current.turns : []),
    }))

  /** Asks `question`, or asks the failed turn `retryOf` again. */
  const ask = async (question: string, retryOf?: string) => {
    const earlier = turns.filter((turn) => turn.id !== retryOf)
    const id = Crypto.randomUUID()
    updateTurns(() => [
      ...earlier,
      { id, question, reply: "", status: "answering" },
    ])
    store.set(answeringAtom, { text: "", lookingUp: null })

    await using run = appRun()
    const { tools, repoTools } = createAssistantTools(access, run, {
      // Only the web build carries it (ai/0003): native reads payky.me's.
      snapshotUrl: apiUrl("/repo-snapshot.json"),
      appVersion: Constants.expoConfig?.version ?? "unknown",
    })
    const current = run.abortable(
      askAssistant({
        messages: toAssistantMessages(earlier, question),
        tools,
        onText: (text) =>
          store.set(answeringAtom, (answer) => ({
            text: answer.text + text,
            lookingUp: null,
          })),
        onToolCall: (toolName) =>
          store.set(answeringAtom, (answer) => ({
            ...answer,
            lookingUp: Object.hasOwn(repoTools, toolName) ? "docs" : "data",
          })),
      }),
      {
        ...run.deps,
        // Payky's AI proxy (ai/0001), which holds the provider and its key.
        // Expo's fetch, because React Native's own does not stream.
        ...createAiModelDep({
          baseURL: apiUrl("/api/ai/v1"),
          ownerId,
          fetch: expoFetch as unknown as typeof globalThis.fetch,
        }),
      }
    )
    // The run's signal cannot tell: a settled fiber's run is disposed, which
    // aborts it too.
    let stopped = false
    fiber.current = {
      abort: () => {
        stopped = true
        current.abort()
      },
    }
    const result = await current
    fiber.current = null

    const reply = result.ok ? result.value : store.get(answeringAtom).text
    const status: AssistantTurn["status"] =
      stopped || (!result.ok && AbortError.is(result.error))
        ? "stopped"
        : result.ok
          ? "answered"
          : "failed"
    updateTurns((all) =>
      all.map((turn) => (turn.id === id ? { ...turn, reply, status } : turn))
    )
  }

  return {
    turns,
    answeringAtom,
    ask: (question: string, retryOf?: string) => void ask(question, retryOf),
    stop: () => fiber.current?.abort(),
    /** Stops a reply still coming and forgets the conversation. */
    startOver: () => {
      fiber.current?.abort()
      updateTurns(() => [])
    },
  }
}

function EmptyConversation({
  access,
  onAsk,
}: {
  readonly access: Access
  readonly onAsk: (question: string) => void
}) {
  const { t } = useTranslation()
  return (
    <YStack gap="3" items="center">
      <Text color="muted-foreground" text="center">
        {t(emptyKeys[access])}
      </Text>
      {suggestions[access].map((key) => (
        <Button
          size="lg"
          key={key}
          label={t(key)}
          variant="outline"
          onPress={() => onAsk(t(key))}
        />
      ))}
    </YStack>
  )
}

function Turn({
  turn,
  answeringAtom,
  onRetry,
}: {
  readonly turn: AssistantTurn
  readonly answeringAtom: PrimitiveAtom<Answering>
  readonly onRetry: () => void
}) {
  const { t } = useTranslation()
  return (
    <>
      <Bubble own>{turn.question}</Bubble>
      {turn.status === "answering" ? (
        <AnsweringBubble answeringAtom={answeringAtom} />
      ) : turn.reply === "" ? null : (
        <Bubble own={false}>{turn.reply}</Bubble>
      )}
      {turn.status === "stopped" ? (
        <Text fontSize={12} color="muted-foreground">
          {t("settings.assistant.stopped")}
        </Text>
      ) : null}
      {turn.status === "failed" ? (
        <Button
          size="xs"
          labelColor="destructive"
          label={t("settings.assistant.failed")}
          variant="ghost"
          onPress={onRetry}
        />
      ) : null}
    </>
  )
}

/**
 * The reply as it streams in. Until the first words it says it is thinking
 * or what a tool reads, if one does; a tool started after some words says it
 * below them.
 */
function AnsweringBubble({
  answeringAtom,
}: {
  readonly answeringAtom: PrimitiveAtom<Answering>
}) {
  const { t } = useTranslation()
  const { text, lookingUp } = useAtomValue(answeringAtom)
  const waitingFor = (
    <Text fontSize={12} color="muted-foreground">
      {lookingUp === null
        ? t("settings.assistant.thinking")
        : t(lookingUpKeys[lookingUp])}
    </Text>
  )
  if (text === "") return <Bubble own={false}>{waitingFor}</Bubble>
  return (
    <>
      <Bubble own={false}>{text}</Bubble>
      {lookingUp === null ? null : waitingFor}
    </>
  )
}

/** The merchant on the primary colour, replies on a bordered card. */
function Bubble({
  own,
  children,
}: {
  readonly own: boolean
  readonly children: string | React.ReactNode
}) {
  return (
    <YStack
      maxW="85%"
      self={own ? "flex-end" : "flex-start"}
      px="3"
      py="2"
      rounded="xl"
      bg={own ? "primary" : "background"}
      borderWidth={own ? 0 : 1}
      borderColor="border-color"
    >
      {typeof children === "string" ? (
        <Text color={own ? "primary-foreground" : "color"}>{children}</Text>
      ) : (
        children
      )}
    </YStack>
  )
}
