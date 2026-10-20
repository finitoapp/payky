import * as Crypto from "expo-crypto"
import type { EvoluExportShareIo } from "./evolu-export-share.ts"

const evoluExportMimeType = "application/vnd.sqlite3"

/** Web's `evolu-export-io.ts` keeps no folder; the name only satisfies the contract. */
export const createExportFolder = (): string =>
  `evolu-export-${Crypto.randomUUID()}`

/** A browser download leaves nothing in the app to clear. */
export const removeStaleExportFolders = (): void => {}

/**
 * Web's export: the browser downloads the file, as web-app's
 * `downloadWithBrowser`. The bytes live only in a blob URL, revoked once the
 * download has started.
 */
export const evoluExportShareIo: EvoluExportShareIo = {
  isSharingAvailable: async () => true,
  writeTemp: async ({ bytes }) =>
    URL.createObjectURL(
      new Blob([bytes.slice()], { type: evoluExportMimeType })
    ),
  share: async (uri, filename) => {
    const link = document.createElement("a")
    link.href = uri
    link.download = filename
    link.rel = "noreferrer"
    document.body.append(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(uri)
  },
  removeTemp: () => {},
}
