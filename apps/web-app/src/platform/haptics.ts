import { Capacitor } from "@capacitor/core"

let capacitorHapticsPromise:
  | Promise<{
      readonly Haptics: typeof import("@capacitor/haptics").Haptics
    }>
  | undefined

const getCapacitorHaptics = async () => {
  capacitorHapticsPromise ??= import("@capacitor/haptics").then(
    ({ Haptics }) => ({ Haptics })
  )

  return capacitorHapticsPromise
}

export async function vibrateDevice(duration: number): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    const { Haptics } = await getCapacitorHaptics()
    await Haptics.vibrate({ duration })
    return
  }

  globalThis.navigator.vibrate?.(duration)
}

const buttonPressVibrationMs = 30

export function vibrateOnButtonPress() {
  void vibrateDevice(buttonPressVibrationMs)
}
