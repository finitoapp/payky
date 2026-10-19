import { createContext, type ReactNode, useContext, useState } from "react"
import { Animated, KeyboardAvoidingView, Platform } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { useTheme } from "tamagui"

/** `Screen`'s content padding, web's `p-4`. */
export const screenPadding = 16

/**
 * The scroll offset `FadeHeader` follows. `Screen` provides it; a screen that
 * scrolls a list of its own (activity) provides its list's instead.
 */
export const ScreenScrollContext = createContext<Animated.Value | null>(null)

/** The screen's vertical scroll offset, for `FadeHeader`; `null` outside a `Screen`. */
export const useScreenScroll = () => useContext(ScreenScrollContext)

/**
 * Keyboard-safe, scrollable, themed screen; taps outside fields reach
 * buttons. `footer` stays fixed under the scrolling content, for a bottom
 * panel or the page's main buttons.
 */
export function Screen({
  children,
  footer,
}: {
  readonly children: ReactNode
  readonly footer?: ReactNode
}) {
  const theme = useTheme()
  const [scrollY] = useState(() => new Animated.Value(0))
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background.val }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScreenScrollContext value={scrollY}>
          <Animated.ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{
              flexGrow: 1,
              padding: screenPadding,
              gap: 16,
            }}
            scrollEventThrottle={16}
            onScroll={Animated.event(
              [{ nativeEvent: { contentOffset: { y: scrollY } } }],
              { useNativeDriver: true }
            )}
          >
            {children}
          </Animated.ScrollView>
        </ScreenScrollContext>
        {footer}
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}
