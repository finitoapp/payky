import { getNativeRuntime } from "@/core/native/runtime.ts"

export type EvoluExportDatabase = "app" | "device"

export interface EvoluExportFile {
  readonly database: EvoluExportDatabase
  readonly filename: string
  readonly bytes: Uint8Array<ArrayBuffer>
}

export interface SavedEvoluExportFile extends EvoluExportFile {
  readonly destination: EvoluExportDestination
}

export type EvoluExportDestination =
  | {
      readonly type: "web"
    }
  | {
      readonly type: "capacitor"
      readonly path: string
      readonly uri: string
    }

export const evoluExportMimeType = "application/vnd.sqlite3"

const exportDirectory = "Payky"

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

export async function saveEvoluExportFile(
  file: EvoluExportFile
): Promise<SavedEvoluExportFile> {
  if (getNativeRuntime() === "capacitor") {
    return {
      ...file,
      destination: await saveWithCapacitor(file),
    }
  }

  downloadWithBrowser(file)

  return {
    ...file,
    destination: {
      type: "web",
    },
  }
}

function formatFilenameTimestamp(date: Date): string {
  const year = date.getFullYear().toString()
  const month = (date.getMonth() + 1).toString().padStart(2, "0")
  const day = date.getDate().toString().padStart(2, "0")
  const hours = date.getHours().toString().padStart(2, "0")
  const minutes = date.getMinutes().toString().padStart(2, "0")
  const seconds = date.getSeconds().toString().padStart(2, "0")

  return `${year}-${month}-${day}-${hours}${minutes}${seconds}`
}

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

async function saveWithCapacitor(
  file: EvoluExportFile
): Promise<EvoluExportDestination> {
  const { Directory, Filesystem } = await import("@capacitor/filesystem")
  const path = `${exportDirectory}/${file.filename}`

  await Filesystem.requestPermissions()

  const result = await Filesystem.writeFile({
    path,
    data: uint8ArrayToBase64(file.bytes),
    directory: Directory.Documents,
    recursive: true,
  })

  return {
    type: "capacitor",
    path,
    uri: result.uri,
  }
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000
  const chunks: string[] = []

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize)
    let value = ""

    for (const byte of chunk) {
      value += String.fromCharCode(byte)
    }

    chunks.push(value)
  }

  return btoa(chunks.join(""))
}
