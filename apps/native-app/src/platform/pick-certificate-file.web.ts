import * as DocumentPicker from "expo-document-picker"
import { nativeEnv } from "../core/native-env.ts"
import { pickE2eCertificateFile } from "../e2e/e2e-certificate-file.ts"
import type { PickedCertificate } from "./pick-certificate-file.ts"

/** A certificate is a few KiB; anything bigger is not one. */
const MAX_CERTIFICATE_BYTES = 1024 * 1024

/**
 * Web's `pick-certificate-file.ts`: the browser's file chooser hands over a
 * `File`, read on demand; there is no cache copy to delete.
 */
export const pickCertificateFile =
  async (): Promise<PickedCertificate | null> => {
    if (nativeEnv.EXPO_PUBLIC_PAYKY_E2E) return pickE2eCertificateFile()
    const result = await DocumentPicker.getDocumentAsync({
      type: "*/*",
      multiple: false,
    })
    const file = result.canceled ? undefined : result.assets[0]?.file
    if (file === undefined) return null

    return {
      name: file.name,
      read: async () =>
        file.size > MAX_CERTIFICATE_BYTES
          ? null
          : new Uint8Array(await file.arrayBuffer()),
    }
  }
