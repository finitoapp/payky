import {
  useMediaQuery,
  useMutationObserver,
  useResizeObserver,
} from "@dedalik/use-react"
import { SendIcon, SquareIcon } from "lucide-react"
import {
  type ReactNode,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
} from "react"

import { FadeHeader } from "@/components/fade-header.tsx"
import { Button } from "@/components/ui/button.tsx"
import { Card, CardContent } from "@/components/ui/card.tsx"
import { Textarea } from "@/components/ui/textarea.tsx"

/**
 * A chat laid out like a messenger: the header stays put, the conversation
 * scrolls between it and the composer, newest at the bottom.
 */
export function ChatLayout({
  title,
  children,
}: {
  readonly title: string
  readonly children: ReactNode
}) {
  return (
    // Fixed to the screen rather than scrolling the window: `FadeHeader`
    // fades out with the window's scroll, and a chat starts scrolled down.
    <div className="fixed inset-x-0 top-[calc(env(safe-area-inset-top,0px)+var(--terminal-banner-height,0px))] bottom-0 mx-auto flex max-w-xl flex-col">
      <FadeHeader title={title} />
      {/* The same 24px above the header as every other settings page. */}
      <div className="h-20 shrink-0" />
      {children}
    </div>
  )
}

/** How close to the bottom still counts as reading the newest messages. */
const STICK_TO_BOTTOM_PX = 80

const followedChanges: MutationObserverInit = {
  childList: true,
  subtree: true,
  characterData: true,
}

/**
 * The conversation's scrolling area. It follows the newest content — a new
 * message, a reply streaming in — while the reader is at the bottom, and
 * leaves them be once they scroll up to read older messages. `followKey`
 * changing jumps to the bottom anyway, as for the reader's own new message.
 */
export function ChatScrollArea({
  followKey,
  children,
}: {
  readonly followKey: string | null
  readonly children: ReactNode
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const stickToBottom = useRef(true)
  // The composer growing or the soft keyboard opening shrinks the view.
  const { height } = useResizeObserver(scrollRef)

  const follow = useCallback(() => {
    const element = scrollRef.current
    if (element === null || !stickToBottom.current) return
    element.scrollTop = element.scrollHeight
  }, [])
  useMutationObserver(scrollRef, follow, followedChanges)

  // biome-ignore lint/correctness/useExhaustiveDependencies: follows size changes and the reader's own messages, not every render.
  useLayoutEffect(follow, [height])
  // biome-ignore lint/correctness/useExhaustiveDependencies: jumps down when the key changes.
  useLayoutEffect(() => {
    if (followKey === null) return
    stickToBottom.current = true
    follow()
  }, [followKey])

  return (
    <div
      ref={scrollRef}
      className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-3 pb-4"
      onScroll={(event) => {
        const element = event.currentTarget
        stickToBottom.current =
          element.scrollHeight - element.scrollTop - element.clientHeight <
          STICK_TO_BOTTOM_PX
      }}
    >
      {children}
    </div>
  )
}

/**
 * Docked to the bottom as a card, like the bill's summary. With `onStop`, the
 * send button becomes a stop button, for a reply that is still coming.
 */
export function ChatComposer({
  label,
  placeholder,
  sendLabel,
  onSend,
  disabled,
  stop,
}: {
  readonly label: string
  readonly placeholder: string
  readonly sendLabel: string
  readonly onSend: (text: string) => void
  readonly disabled: boolean
  readonly stop?: { readonly label: string; readonly onStop: () => void }
}) {
  const [draft, setDraft] = useState("")
  // On a phone Enter is a new line and the button sends, as in messengers;
  // with a keyboard Enter sends and Shift+Enter breaks the line. Ctrl/Cmd+Enter
  // sends everywhere, a hardware keyboard on a touch device included.
  const touch = useMediaQuery("(pointer: coarse)")
  const blocked = disabled || stop !== undefined

  const submit = () => {
    const text = draft.trim()
    if (text === "" || blocked) return
    setDraft("")
    onSend(text)
  }

  return (
    <Card className="shrink-0 rounded-none rounded-t-xl py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]">
      <CardContent className="px-3">
        <form
          className="flex items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            submit()
          }}
        >
          <Textarea
            rows={1}
            aria-label={label}
            // Grows with its content up to five lines, natively; an older
            // WebView without `field-sizing` keeps one line and scrolls inside
            // it. One line is as tall as the button: 20px, 7px padding, 1px
            // border. iOS zooms into a field under 16px, so it keeps 16px.
            className="max-h-32 min-h-9 resize-none py-[7px] text-sm/5 [field-sizing:content] md:text-sm/5 [@supports(-webkit-touch-callout:none)]:text-base/5"
            placeholder={placeholder}
            enterKeyHint={touch ? "enter" : "send"}
            value={draft}
            disabled={disabled}
            onChange={(event) => setDraft(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter" || event.nativeEvent.isComposing) {
                return
              }
              const sends =
                event.ctrlKey || event.metaKey || !(event.shiftKey || touch)
              if (!sends) return
              event.preventDefault()
              submit()
            }}
          />
          {stop === undefined ? (
            <Button
              type="submit"
              size="icon-lg"
              className="shrink-0"
              aria-label={sendLabel}
              disabled={disabled || draft.trim() === ""}
              // Keeps the focus, and with it the soft keyboard, in the textarea.
              onMouseDown={(event) => event.preventDefault()}
            >
              <SendIcon />
            </Button>
          ) : (
            <Button
              type="button"
              size="icon-lg"
              variant="secondary"
              className="shrink-0"
              aria-label={stop.label}
              onMouseDown={(event) => event.preventDefault()}
              onClick={stop.onStop}
            >
              <SquareIcon />
            </Button>
          )}
        </form>
      </CardContent>
    </Card>
  )
}
