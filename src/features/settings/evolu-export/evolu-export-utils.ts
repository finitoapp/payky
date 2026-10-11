import { Capacitor } from "@capacitor/core"
import { format } from "date-fns"

export type EvoluExportDatabase = "app"

interface EvoluExportFile {
  readonly database: EvoluExportDatabase
  readonly filename: string
  readonly bytes: Uint8Array<ArrayBuffer>
}

export interface SavedEvoluExportFile extends EvoluExportFile {
  readonly destination: EvoluExportDestination
}

type EvoluExportDestination =
  | {
      readonly type: "web"
    }
  | {
      readonly type: "capacitor"
    }

const evoluExportMimeType = "application/vnd.sqlite3"

export function createEvoluExportFilename({
  createdAt,
  database,
}: {
  readonly createdAt: Date
  readonly database: EvoluExportDatabase
}): string {
  return `payky-evolu-${database}-export-${formatFilenameTimestamp(createdAt)}.sqlite`
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes.toString()} B`

  const units = ["KiB", "MiB", "GiB"] as const
  let value = bytes / 1024

  for (const unit of units) {
    if (value < 1024) return `${value.toFixed(1)} ${unit}`
    value /= 1024
  }

  return `${value.toFixed(1)} TiB`
}

export function formatExportCreatedAt(date: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(date)
}

/**
 * Resolves to `null` when the user dismisses the native share sheet: nothing
 * left the device, which is neither a success nor a failure.
 */
export async function saveEvoluExportFile(
  file: EvoluExportFile
): Promise<SavedEvoluExportFile | null> {
  if (Capacitor.isNativePlatform()) {
    const shared = await shareWithCapacitor(file)

    return shared ? { ...file, destination: { type: "capacitor" } } : null
  }

  downloadWithBrowser(file)

  return {
    ...file,
    destination: {
      type: "web",
    },
  }
}

const formatFilenameTimestamp = (date: Date) =>
  format(date, "yyyy-MM-dd-HHmmss")

function downloadWithBrowser(file: EvoluExportFile): void {
  const blob = new Blob([file.bytes], { type: evoluExportMimeType })
  const href = URL.createObjectURL(blob)
  const link = document.createElement("a")

  link.href = href
  link.download = file.filename
  link.rel = "noreferrer"
  document.body.append(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(href)
}

/**
 * The export holds the Spark wallet secret, so it is written to the app's
 * private cache — never shared storage such as `Documents/`, which any app
 * with storage access can read — and handed to the system share sheet, where
 * the user picks the one place it goes. The directory matches the only path
 * `android/app/src/main/res/xml/file_paths.xml` lets the FileProvider grant;
 * it is cleared before each export so earlier files do not pile up.
 */
async function shareWithCapacitor(file: EvoluExportFile): Promise<boolean> {
  const [{ Directory, Filesystem }, { Share }] = await Promise.all([
    import("@capacitor/filesystem"),
    import("@capacitor/share"),
  ])

  await Filesystem.rmdir({
    path: evoluExportCacheDirectory,
    directory: Directory.Cache,
    recursive: true,
  }).catch(() => undefined)

  const { uri } = await Filesystem.writeFile({
    path: `${evoluExportCacheDirectory}/${file.filename}`,
    data: uint8ArrayToBase64(file.bytes),
    directory: Directory.Cache,
    recursive: true,
  })

  try {
    await Share.share({ title: file.filename, files: [uri] })
    return true
  } catch (error) {
    if (error instanceof Error && error.message === shareCanceledMessage) {
      return false
    }
    throw error
  }
}

const evoluExportCacheDirectory = "evolu-export"

/** The rejection message both native Share implementations use on dismiss. */
const shareCanceledMessage = "Share canceled"

/**
 * `btoa` wants a binary string, so the bytes go through `String.fromCharCode`
 * one spread at a time. The chunking is the point: spreading a whole database
 * export in one call would blow the argument limit, and 0x8000 is the usual
 * safe width. Exported for its test — the chunk boundary is the only thing
 * here that can break, and nothing else reaches this from outside.
 *
 * `Uint8Array.prototype.toBase64` would replace all of it, but it doesn't
 * exist in this TypeScript target (ES2024) and isn't in the runtimes this app
 * still supports.
 */
export function uint8ArrayToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000
  const chunks: string[] = []

  for (let index = 0; index < bytes.length; index += chunkSize) {
    chunks.push(
      String.fromCharCode(...bytes.subarray(index, index + chunkSize))
    )
  }

  return btoa(chunks.join(""))
}
