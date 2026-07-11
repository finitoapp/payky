import { getNativeRuntime } from "@/core/native/runtime.ts"

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
  const runtime = getNativeRuntime()

  if (runtime === "capacitor") {
    const { Haptics } = await getCapacitorHaptics()
    await Haptics.vibrate({ duration })
    return
  }

  globalThis.navigator.vibrate?.(duration)
}
