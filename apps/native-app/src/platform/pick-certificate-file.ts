import * as DocumentPicker from "expo-document-picker"
import { File } from "expo-file-system"

/** A certificate is a few KiB; anything bigger is not one. */
const MAX_CERTIFICATE_BYTES = 1024 * 1024

export interface PickedCertificate {
  readonly name: string
  /** Reads the file once and removes the picker's private cache copy. */
  readonly read: () => Promise<Uint8Array | null>
}

/**
 * Lets the user choose a certificate file. The picker copies it to the app's
 * private cache; only its name is kept in state, the bytes are read on
 * demand and the copy is deleted right after, so no file URI is persisted.
 * `null` when the chooser was dismissed.
 */
export const pickCertificateFile =
  async (): Promise<PickedCertificate | null> => {
    const result = await DocumentPicker.getDocumentAsync({
      // PKCS#12 has no reliable MIME type across Android providers.
      type: "*/*",
      copyToCacheDirectory: true,
      multiple: false,
    })
    const asset = result.canceled ? undefined : result.assets[0]
    if (asset === undefined) return null

    return {
      name: asset.name,
      read: async () => {
        const file = new File(asset.uri)
        try {
          if (file.size > MAX_CERTIFICATE_BYTES) return null
          return new Uint8Array(await file.arrayBuffer())
        } finally {
          file.delete()
        }
      },
    }
  }
