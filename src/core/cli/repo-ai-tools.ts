import { execFile } from "node:child_process"
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { promisify } from "node:util"
import { tool } from "ai"
import { z } from "zod"
import { takeLines } from "@/lib/take-lines.ts"

const execFileAsync = promisify(execFile)

const maxListedFiles = 500
const maxSearchLines = 200
const maxReadLines = 400

/**
 * Documentation and source code tools over the git checkout at `rootDir`.
 * They read only files git tracks, so `.env` files, build output and
 * `node_modules` stay out of the model's reach, and a path cannot climb out
 * of the repository.
 */
export const createRepoAiTools = (rootDir: string) => {
  const git = async (args: ReadonlyArray<string>) =>
    (
      await execFileAsync("git", [...args], {
        cwd: rootDir,
        maxBuffer: 16 * 1024 * 1024,
      })
    ).stdout

  let trackedFiles: Promise<ReadonlySet<string>> | null = null
  const loadTrackedFiles = () => {
    trackedFiles ??= git(["ls-files"]).then(
      (stdout) => new Set(stdout.split("\n").filter((line) => line !== ""))
    )
    return trackedFiles
  }

  return {
    listFiles: tool({
      description:
        "List repository files under a path prefix. Documentation is under docs/ (business decisions in docs/decisions/), app source under src/.",
      inputSchema: z.object({ prefix: z.string() }),
      execute: async ({ prefix }) => {
        const files = [...(await loadTrackedFiles())].filter((file) =>
          file.startsWith(prefix)
        )
        return takeLines(files.join("\n"), maxListedFiles)
      },
    }),
    readFile: tool({
      description:
        "Read a repository file, optionally only a 1-based inclusive line range. Lines are prefixed with their number.",
      inputSchema: z.object({
        path: z.string(),
        fromLine: z.number().int().min(1).optional(),
        toLine: z.number().int().min(1).optional(),
      }),
      execute: async ({ path, fromLine = 1, toLine }) => {
        if (!(await loadTrackedFiles()).has(path)) {
          return { error: `Not a tracked file: ${path}` }
        }
        const lines = (await readFile(join(rootDir, path), "utf8")).split("\n")
        const numbered = lines
          .slice(fromLine - 1, toLine ?? lines.length)
          .map((line, index) => `${fromLine + index}: ${line}`)
        return takeLines(numbered.join("\n"), maxReadLines)
      },
    }),
    searchCode: tool({
      description:
        "Search repository files with an extended regular expression (git grep). Returns file:line:text matches.",
      inputSchema: z.object({
        pattern: z.string().min(1),
        path: z.string().optional(),
      }),
      execute: async ({ pattern, path }) => {
        try {
          const stdout = await git([
            "grep",
            "-n",
            "-I",
            "-E",
            "-e",
            pattern,
            "--",
            ...(path === undefined ? [] : [path]),
          ])
          return takeLines(stdout, maxSearchLines)
        } catch (error) {
          // git grep exits with 1 when nothing matches.
          if ((error as { code?: unknown }).code === 1) return "No matches."
          return { error: String(error) }
        }
      },
    }),
  }
}
