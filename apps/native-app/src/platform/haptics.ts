import { AndroidHaptics, performAndroidHapticsAsync } from "expo-haptics"

/**
 * Web's `platform/haptics.ts`, on Android's haptic engine rather than a
 * timed vibration: web vibrates 30 ms on a press and 50 ms on a Bolt Card
 * read, here the system's matching effects play (no VIBRATE permission,
 * and the user's touch-feedback setting is respected). A device without
 * haptics just stays still, so failures are dropped.
 */
const play = (effect: AndroidHaptics) => {
  void performAndroidHapticsAsync(effect).catch(() => undefined)
}

/** A key, a stepper, an item added or taken off: web's `vibrateOnButtonPress`. */
export const hapticButtonPress = () => play(AndroidHaptics.Virtual_Key)

/** A code or card that was accepted: web's scan and Bolt Card vibrations. */
export const hapticConfirm = () => play(AndroidHaptics.Confirm)
