import ArrowDown from "lucide-react-native/icons/arrow-down"
import {
  type ComponentRef,
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react"
import {
  Animated,
  KeyboardAvoidingView,
  Platform,
  type ScrollView,
} from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { useTheme, View } from "tamagui"
import { useTranslation } from "../hooks/use-translation.ts"
import { radius } from "../theme/tokens.ts"
import { Button } from "./ui/button.tsx"
import { useColumnScroll } from "./web-column.tsx"

/** `Screen`'s vertical content padding. */
export const screenPadding = 16

/** A screen's side padding, web's `px-3` (`_terminal.tsx`'s viewport). */
export const screenPaddingX = 12

/**
 * The scroll offset `FadeHeader` follows. `Screen` provides it; a screen that
 * scrolls a list of its own (activity) provides its list's instead.
 */
export const ScreenScrollContext = createContext<Animated.Value | null>(null)

/** The screen's vertical scroll offset, for `FadeHeader`; `null` outside a `Screen`. */
export const useScreenScroll = () => useContext(ScreenScrollContext)

interface ScrollEvent {
  readonly nativeEvent: {
    readonly contentOffset: { readonly y: number }
    readonly contentSize: { readonly height: number }
    readonly layoutMeasurement: { readonly height: number }
  }
}

/** How close to the bottom still counts as reading the newest messages. */
const STICK_TO_BOTTOM_PX = 80

/**
 * Keyboard-safe, scrollable, themed screen; taps outside fields reach
 * buttons. `footer` stays fixed under the scrolling content, for a bottom
 * panel or the page's main buttons.
 *
 * `followKey` (any value but `undefined`) makes it a chat, as web's
 * `ChatScrollArea`: it follows the newest content (a new message, a reply
 * streaming in, the keyboard or composer shrinking the view) while the
 * reader is at the bottom, leaves them be once they scroll up, with a button
 * back to the latest, and jumps down whenever a non-null key changes, as for
 * the reader's own new message.
 */
export function Screen({
  children,
  footer,
  followKey,
}: {
  readonly children: ReactNode
  readonly footer?: ReactNode
  readonly followKey?: string | null
}) {
  const theme = useTheme()
  const { t } = useTranslation()
  const column = useColumnScroll()
  const [scrollY] = useState(() => new Animated.Value(0))
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null)
  const chat = followKey !== undefined
  // A ref for following, state only for the button.
  const stickToBottom = useRef(true)
  const [awayFromBottom, setAwayFromBottom] = useState(false)
  const follow = () => {
    if (chat && stickToBottom.current) scrollRef.current?.scrollToEnd()
  }
  useEffect(() => {
    if (followKey === undefined || followKey === null) return
    stickToBottom.current = true
    scrollRef.current?.scrollToEnd()
  }, [followKey])
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background.val }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScreenScrollContext value={scrollY}>
          <View flex={1}>
            <Animated.ScrollView
              ref={scrollRef}
              style={column.style}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{
                flexGrow: 1,
                padding: screenPadding,
                paddingHorizontal: screenPaddingX + column.padding,
                gap: 16,
              }}
              scrollEventThrottle={16}
              onScroll={Animated.event(
                [{ nativeEvent: { contentOffset: { y: scrollY } } }],
                {
                  useNativeDriver: true,
                  listener: chat
                    ? ({ nativeEvent }: ScrollEvent) => {
                        stickToBottom.current =
                          nativeEvent.contentSize.height -
                            nativeEvent.contentOffset.y -
                            nativeEvent.layoutMeasurement.height <
                          STICK_TO_BOTTOM_PX
                        setAwayFromBottom(!stickToBottom.current)
                      }
                    : undefined,
                }
              )}
              onContentSizeChange={follow}
              onLayout={follow}
            >
              {children}
            </Animated.ScrollView>
            {chat && awayFromBottom ? (
              <View position="absolute" b={12} l={0} r={0} items="center">
                <Button
                  variant="secondary"
                  size="icon"
                  rounded={radius.full}
                  iconStart={ArrowDown}
                  accessibilityLabel={t("settings.chat.scrollToLatest")}
                  onPress={() => scrollRef.current?.scrollToEnd()}
                />
              </View>
            ) : null}
          </View>
        </ScreenScrollContext>
        {footer}
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}
