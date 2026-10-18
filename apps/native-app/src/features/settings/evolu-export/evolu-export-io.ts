import * as Crypto from "expo-crypto"
import { Directory, File, Paths } from "expo-file-system"
import * as Sharing from "expo-sharing"
import type { EvoluExportShareIo } from "./evolu-export-share.ts"

const folderPrefix = "evolu-export-"
const evoluExportMimeType = "application/vnd.sqlite3"

/** A random folder name in the private cache; `crypto` is a CSPRNG. */
export const createExportFolder = (): string =>
  `${folderPrefix}${Crypto.randomUUID()}`

export const removeStaleExportFolders = (): void => {
  for (const entry of Paths.cache.list()) {
    if (entry instanceof Directory && entry.name.startsWith(folderPrefix)) {
      entry.delete()
    }
  }
}

/** The app's private cache: never shared storage, and readable by the share sheet through expo-sharing's FileProvider. */
export const evoluExportShareIo: EvoluExportShareIo = {
  isSharingAvailable: () => Sharing.isAvailableAsync(),
  writeTemp: async ({ folder, filename, bytes }) => {
    // Clear anything an earlier export left behind (app killed mid-share).
    removeStaleExportFolders()
    const directory = new Directory(Paths.cache, folder)
    directory.create({ intermediates: true })
    const file = new File(directory, filename)
    file.create()
    await file.write(bytes)
    return file.uri
  },
  share: (uri, filename) =>
    Sharing.shareAsync(uri, {
      mimeType: evoluExportMimeType,
      dialogTitle: filename,
    }),
  removeTemp: (folder) => {
    const directory = new Directory(Paths.cache, folder)
    if (directory.exists) directory.delete()
  },
}
