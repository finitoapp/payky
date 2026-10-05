import { execFile } from "node:child_process"
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { promisify } from "node:util"
import type { RepoFiles } from "@/core/ai/repo-ai-tools.ts"

const execFileAsync = promisify(execFile)

/**
 * The text files git tracks in the checkout at `rootDir`, for
 * `createRepoAiTools`. Listed once, read on demand.
 */
export const createGitRepoFiles = (rootDir: string) => {
  let files: Promise<RepoFiles> | null = null

  const load = async (): Promise<RepoFiles> => {
    // `-I` leaves binary files out; every text file matches the empty pattern.
    const { stdout } = await execFileAsync(
      "git",
      ["grep", "-I", "-l", "-z", "-e", ""],
      { cwd: rootDir, maxBuffer: 16 * 1024 * 1024 }
    )
    const paths = stdout.split("\0").filter((path) => path !== "")
    const tracked = new Set(paths)
    return {
      paths,
      read: async (path) =>
        tracked.has(path) ? readFile(join(rootDir, path), "utf8") : null,
      note: null,
    }
  }

  return () => {
    files ??= load()
    return files
  }
}
