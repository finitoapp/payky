import { AbortError } from "@evolu/common"
import { atom, type PrimitiveAtom, useAtomValue, useStore } from "jotai"
import { AlertCircleIcon, RotateCwIcon } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { Button } from "@/components/ui/button.tsx"
import { createAiModelDep } from "@/core/ai/ai-model.ts"
import { askAssistant } from "@/core/ai/assistant.ts"
import { appEnv } from "@/core/app-env.ts"
import {
  type AssistantTurn,
  assistantConversationAtom,
  toAssistantMessages,
} from "@/features/settings/assistant/assistant-conversation.ts"
import { decisionAiTools } from "@/features/settings/assistant/decision-ai-tools.ts"
import {
  ChatComposer,
  ChatLayout,
  ChatScrollArea,
} from "@/features/settings/chat/chat-layout.tsx"
import { useAppRun } from "@/hooks/use-app-run.ts"
import { useEvolu } from "@/hooks/use-evolu.ts"
import { useTranslation } from "@/hooks/use-translation.ts"
import type { TranslationKey } from "@/i18n/resources.ts"
import { cn } from "@/lib/utils.ts"

/** Payky's AI proxy (ai/0001), which holds the provider and its key. */
const AI_PROXY_URL = new URL(
  "/api/ai/v1",
  appEnv.VITE_PAYKY_API_BASE_URL
).toString()

const suggestions = [
  "settings.assistant.suggestion.openBills",
  "settings.assistant.suggestion.latestPayments",
  "settings.assistant.suggestion.today",
] as const satisfies ReadonlyArray<TranslationKey>

/** The reply being streamed in, and whether a tool is reading data for it. */
interface Answering {
  readonly text: string
  readonly lookingUp: boolean
}

/**
 * A chat with the assistant (ai/0002), laid out like the support chat. The
 * assistant reads the merchant's local data through its tools and answers
 * through Payky's AI proxy. The conversation stays in memory while the app
 * runs; leaving the page stops a reply that is still coming.
 */
export function AssistantChatPage() {
  const { t } = useTranslation()
  const { turns, answeringAtom, ask, stop } = useAssistantConversation()
  const last = turns.at(-1)
  const answering = last?.status === "answering"

  return (
    <ChatLayout title={t("settings.assistant.title")}>
      <ChatScrollArea followKey={answering ? last.id : null}>
        {turns.length === 0 ? (
          <EmptyConversation onAsk={ask} />
        ) : (
          <ol className="mt-auto flex flex-col gap-3" aria-live="polite">
            {turns.map((turn) => (
              <Turn
                key={turn.id}
                turn={turn}
                answeringAtom={answeringAtom}
                onRetry={() => ask(turn.question, turn.id)}
              />
            ))}
          </ol>
        )}
      </ChatScrollArea>
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
    </ChatLayout>
  )
}

/**
 * The conversation of the active account and asking within it. The reply
 * being streamed lives in a page-scoped atom that only its bubble reads, so
 * a token re-renders that bubble rather than the whole conversation; it joins
 * the conversation once it is complete.
 */
function useAssistantConversation() {
  const appRun = useAppRun()
  const store = useStore()
  const ownerId = useEvolu().appOwner.id
  const conversation = useAtomValue(assistantConversationAtom)
  const turns = conversation.ownerId === ownerId ? conversation.turns : []
  const [answeringAtom] = useState(() =>
    atom<Answering>({ text: "", lookingUp: false })
  )
  const fiber = useRef<{ readonly abort: () => void } | null>(null)

  // Leaving the page stops the reply; what came so far stays.
  useEffect(() => () => fiber.current?.abort(), [])

  const updateTurns = (
    update: (
      turns: ReadonlyArray<AssistantTurn>
    ) => ReadonlyArray<AssistantTurn>
  ) =>
    store.set(assistantConversationAtom, (current) => ({
      ownerId,
      turns: update(current.ownerId === ownerId ? current.turns : []),
    }))

  /** Asks `question`, or asks the failed turn `retryOf` again. */
  const ask = async (question: string, retryOf?: string) => {
    const earlier = turns.filter((turn) => turn.id !== retryOf)
    const id = crypto.randomUUID()
    updateTurns(() => [
      ...earlier,
      { id, question, reply: "", status: "answering" },
    ])
    store.set(answeringAtom, { text: "", lookingUp: false })

    await using run = appRun()
    const current = run.abortable(
      askAssistant({
        messages: toAssistantMessages(earlier, question),
        // The source code tools need the repository, so only the CLI has them.
        tools: decisionAiTools,
        onText: (text) =>
          store.set(answeringAtom, (answer) => ({
            text: answer.text + text,
            lookingUp: false,
          })),
        onToolCall: () =>
          store.set(answeringAtom, (answer) => ({
            ...answer,
            lookingUp: true,
          })),
      }),
      { ...run.deps, ...createAiModelDep({ baseURL: AI_PROXY_URL, ownerId }) }
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
  }
}

function EmptyConversation({
  onAsk,
}: {
  readonly onAsk: (question: string) => void
}) {
  const { t } = useTranslation()
  return (
    <div className="m-auto flex max-w-xs flex-col items-center gap-3 text-center">
      <p className="text-sm text-muted-foreground">
        {t("settings.assistant.empty")}
      </p>
      {suggestions.map((key) => (
        <Button
          key={key}
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onAsk(t(key))}
        >
          {t(key)}
        </Button>
      ))}
    </div>
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
        <li className="self-start px-1 text-xs text-muted-foreground">
          {t("settings.assistant.stopped")}
        </li>
      ) : null}
      {turn.status === "failed" ? (
        <li className="self-start">
          <Button
            type="button"
            variant="ghost"
            size="xs"
            className="text-destructive"
            onClick={onRetry}
          >
            <AlertCircleIcon data-icon="inline-start" />
            {t("settings.assistant.failed")}
            <RotateCwIcon data-icon="inline-end" />
          </Button>
        </li>
      ) : null}
    </>
  )
}

/** The reply as it streams in; until the first words, what it waits for. */
function AnsweringBubble({
  answeringAtom,
}: {
  readonly answeringAtom: PrimitiveAtom<Answering>
}) {
  const { t } = useTranslation()
  const { text, lookingUp } = useAtomValue(answeringAtom)
  if (text !== "" && !lookingUp) return <Bubble own={false}>{text}</Bubble>
  return (
    <>
      {text === "" ? null : <Bubble own={false}>{text}</Bubble>}
      <li className="animate-pulse self-start px-1 text-xs text-muted-foreground">
        {t(
          lookingUp
            ? "settings.assistant.lookingUp"
            : "settings.assistant.thinking"
        )}
      </li>
    </>
  )
}

/** The support chat's bubbles: the merchant on the primary colour, replies on a card. */
function Bubble({
  own,
  children,
}: {
  readonly own: boolean
  readonly children: string
}) {
  return (
    <li
      className={cn(
        "max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap [overflow-wrap:anywhere]",
        own
          ? "self-end bg-primary text-primary-foreground"
          : "self-start bg-card text-card-foreground ring-1 ring-foreground/10 ring-inset"
      )}
    >
      {children}
    </li>
  )
}
