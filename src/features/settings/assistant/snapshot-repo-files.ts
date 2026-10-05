import type { Run } from "@evolu/common"
import type { RepoFiles } from "@/core/ai/repo-ai-tools.ts"
import type { FetchDep } from "@/core/deps.ts"
import {
  fetchRepoSnapshot,
  type RepoSnapshot,
} from "@/core/integrations/repo-snapshot/repo-snapshot-client.ts"

/** The repository files of a snapshot, noting when it is not the app's code. */
export const snapshotRepoFiles = (
  { version, files }: RepoSnapshot,
  appVersion: string
): RepoFiles => ({
  paths: Object.keys(files),
  read: async (path) =>
    Object.hasOwn(files, path) ? (files[path] ?? null) : null,
  note:
    version === appVersion
      ? null
      : `Note: this is the code of Payky ${version}, while the app runs ${appVersion}.`,
})

let loaded: Promise<RepoFiles> | null = null

/**
 * The repository files for the assistant's tools, downloaded on their first
 * use and kept while the app runs. A failed download is tried again next time.
 */
export const createSnapshotRepoFilesLoader =
  (run: Run<FetchDep>) => (): Promise<RepoFiles> => {
    loaded ??= (async () => {
      try {
        const snapshot = await run.orThrow(fetchRepoSnapshot())
        return snapshotRepoFiles(snapshot, __APP_VERSION__)
      } catch (error) {
        loaded = null
        // The tool fails with it, and the model reads that it failed.
        throw error
      }
    })()
    return loaded
  }
