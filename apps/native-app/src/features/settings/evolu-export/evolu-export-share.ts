/** The file system and share sheet, injected so the order of operations is testable. */
export interface EvoluExportShareIo {
  readonly isSharingAvailable: () => Promise<boolean>
  /** Writes `bytes` into a fresh private cache folder and returns the file URI. */
  readonly writeTemp: (input: {
    readonly folder: string
    readonly filename: string
    readonly bytes: Uint8Array
  }) => Promise<string>
  /** Resolves when the system share sheet closes, whatever the user picked. */
  readonly share: (uri: string, filename: string) => Promise<void>
  readonly removeTemp: (folder: string) => void
}

export type EvoluExportShareOutcome = "shared" | "unavailable"

/**
 * The export holds every secret in the app database, so the file lives only in
 * the app's private cache, in a folder named by a random id, and is deleted
 * once the share sheet closes — whether the user shared, dismissed it, or the
 * write or share failed. Nothing is written when sharing is unavailable. A
 * failure is thrown; the bytes and the URI are never logged.
 */
export async function shareEvoluExport({
  io,
  bytes,
  filename,
  folder,
}: {
  readonly io: EvoluExportShareIo
  readonly bytes: Uint8Array
  readonly filename: string
  /** Random and unguessable: the caller draws it from a CSPRNG. */
  readonly folder: string
}): Promise<EvoluExportShareOutcome> {
  if (!(await io.isSharingAvailable())) return "unavailable"

  try {
    const uri = await io.writeTemp({ folder, filename, bytes })
    await io.share(uri, filename)
    return "shared"
  } finally {
    try {
      io.removeTemp(folder)
    } catch {
      // Nothing left to do; the next export clears stale folders too.
    }
  }
}
