import { DeviceEventEmitter, TextInput } from "react-native"

/** Emitted by `plugins/with-hardware-key-events.cjs` for every hardware key. */
const HARDWARE_KEY_EVENT = "payky.hardwareKey"

/** One hardware (physical keyboard or keyboard-wedge scanner) key press. */
export interface HardwareKeyEvent {
  /** A printed character, or a named key (`Enter`, `Backspace`, `Shift`, ...). */
  readonly key: string
  /** Only differences between keys are used (scanner/0001's burst timing). */
  readonly timeStamp: number
  /** A text field has focus, so the key is that field's typing. */
  readonly inTextField: boolean
  /**
   * Keeps the key from its default action. Only web has one (a focused
   * button activating on Enter); on Android the key reaches JS after native
   * has handled it, so this does nothing.
   */
  readonly preventDefault: () => void
}

interface NativeHardwareKeyEvent {
  readonly key: string
  /** `KeyEvent.getEventTime()`. */
  readonly timeStamp: number
}

const noop = () => {}

/**
 * Calls `listener` for every hardware key: the one source of key presses for
 * both the barcode scanner and the terminal keypad. On Android the activity
 * forwards each key down without consuming it; `hardware-keys.web.ts`
 * listens on `document`. A soft keyboard commits text without key events,
 * so only hardware keys arrive. Returns the unsubscribe function.
 */
export function addHardwareKeyListener(
  listener: (event: HardwareKeyEvent) => void
): () => void {
  const subscription = DeviceEventEmitter.addListener(
    HARDWARE_KEY_EVENT,
    (event: NativeHardwareKeyEvent) =>
      listener({
        key: event.key,
        timeStamp: event.timeStamp,
        inTextField: TextInput.State.currentlyFocusedInput() !== null,
        preventDefault: noop,
      })
  )
  return () => subscription.remove()
}
