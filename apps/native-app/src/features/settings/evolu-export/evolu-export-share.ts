/** The file system and share sheet, injected so the order of operations is testable. */
export interface EvoluExportShareIo {
  readonly isSharingAvailable: () => Promise<boolean>
  /** Writes `bytes` into a fresh private cache folder and returns the file URI. */
  readonly writeTemp: (input: {
    readonly folder: string
    readonly filename: string
    readonly bytes: Uint8Array
  }) => Promise<string>
  /** Resolves when the share sheet closes; a completed share and a dismissal look the same. */
  readonly share: (uri: string, filename: string) => Promise<void>
  readonly removeTemp: (folder: string) => void
}

export type EvoluExportShareOutcome = "shared" | "unavailable"

/**
 * The export holds every secret in the app database, so the file lives only in
 * the app's private cache (not backed up), in a folder named by a random id.
 * Once handed to the share sheet the file is deliberately left in place: the
 * target app (Gmail, Drive, Signal) may read it lazily, after the sheet has
 * closed, and deleting it then would silently lose the export. The next
 * export and the next app start clear stale folders. A file that was never
 * handed over (write failed) is removed at once; nothing is written when
 * sharing is unavailable. A failure is thrown; the bytes and the URI are never
 * logged.
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

  let uri: string
  try {
    uri = await io.writeTemp({ folder, filename, bytes })
  } catch (error) {
    try {
      io.removeTemp(folder)
    } catch {
      // Nothing left to do; the next cleanup clears it.
    }
    throw error
  }
  await io.share(uri, filename)
  return "shared"
}
