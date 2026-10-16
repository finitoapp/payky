import {
  Capacitor,
  type PluginListenerHandle,
  registerPlugin,
} from "@capacitor/core"
import { z } from "zod"

/**
 * Bridge to the local Android NFC reader plugin
 * (`android/app/src/main/java/me/payky/NfcPlugin.java`). There is no iOS
 * side: iOS only reads tags behind a system sheet the user has to open, which
 * cannot sit under a QR code waiting for a tap. Outside Android every call
 * reports `unsupported` and does nothing.
 */
interface NfcNativePlugin {
  getStatus(): Promise<{ readonly status: NfcStatus }>
  startReading(): Promise<void>
  stopReading(): Promise<void>
  openSettings(): Promise<void>
  addListener(
    eventName: "tagRead",
    listener: (event: unknown) => void
  ): Promise<PluginListenerHandle>
}

export type NfcStatus = "unsupported" | "disabled" | "enabled"

const NfcTagReadEventSchema = z.object({
  uri: z.string().nullable().default(null),
})

const NfcNative = registerPlugin<NfcNativePlugin>("Nfc")

export const isNfcPlatform = (): boolean =>
  Capacitor.getPlatform() === "android"

export const getNfcStatus = async (): Promise<NfcStatus> =>
  isNfcPlatform() ? (await NfcNative.getStatus()).status : "unsupported"

export const openNfcSettings = async (): Promise<void> => {
  if (isNfcPlatform()) await NfcNative.openSettings()
}

/**
 * Turns the reader on and calls `onTag` with each tapped tag's first NDEF
 * URI, or `null` for a tag that carries none. The returned function turns
 * the reader off again.
 */
export const startNfcReading = async (
  onTag: (uri: string | null) => void
): Promise<() => Promise<void>> => {
  const listener = await NfcNative.addListener("tagRead", (event) => {
    const parsed = NfcTagReadEventSchema.safeParse(event)
    onTag(parsed.success ? parsed.data.uri : null)
  })
  await NfcNative.startReading()

  return async () => {
    await listener.remove()
    await NfcNative.stopReading()
  }
}
