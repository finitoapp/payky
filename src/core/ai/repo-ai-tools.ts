import { tool } from "ai"
import { z } from "zod"
import { takeLines } from "@/lib/take-lines.ts"

const maxListedFiles = 500
const maxSearchLines = 200
const maxReadLines = 400

/** The text files of the repository the documentation and code tools read. */
export interface RepoFiles {
  readonly paths: ReadonlyArray<string>
  /** The file's text, or `null` when the repository has no such text file. */
  readonly read: (path: string) => Promise<string | null>
  /** Put before every result, such as that the code is of another version. */
  readonly note: string | null
}

/**
 * Documentation and source code tools over the repository files that
 * `loadFiles` gives: the git checkout in the CLI, the web build's snapshot in
 * the app (ai/0003). A path outside those files reads nothing, so `.env`
 * files, build output and `node_modules` stay out of the model's reach.
 */
export const createRepoAiTools = (loadFiles: () => Promise<RepoFiles>) => {
  const withNote = (files: RepoFiles, text: string) =>
    files.note === null ? text : `${files.note}\n${text}`

  return {
    listFiles: tool({
      description:
        "List repository files under a path prefix. Documentation is under docs/ (business decisions in docs/decisions/), app source under src/.",
      inputSchema: z.object({ prefix: z.string() }),
      execute: async ({ prefix }) => {
        const files = await loadFiles()
        const paths = files.paths.filter((path) => path.startsWith(prefix))
        return withNote(files, takeLines(paths.join("\n"), maxListedFiles))
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
        const files = await loadFiles()
        const text = await files.read(path)
        if (text === null) return { error: `Not a repository file: ${path}` }
        const lines = text.split("\n")
        const numbered = lines
          .slice(fromLine - 1, toLine ?? lines.length)
          .map((line, index) => `${fromLine + index}: ${line}`)
        return withNote(files, takeLines(numbered.join("\n"), maxReadLines))
      },
    }),
    searchCode: tool({
      description:
        "Search repository files with a case-insensitive JavaScript regular expression, optionally only under a path prefix. Returns path:line:text matches.",
      inputSchema: z.object({
        pattern: z.string().min(1),
        path: z.string().optional(),
      }),
      execute: async ({ pattern, path = "" }) => {
        let regExp: RegExp
        try {
          regExp = new RegExp(pattern, "iu")
        } catch (error) {
          return { error: String(error) }
        }
        const files = await loadFiles()
        const matches = await Promise.all(
          files.paths
            .filter((file) => file.startsWith(path))
            .map(async (file) =>
              ((await files.read(file)) ?? "")
                .split("\n")
                .flatMap((line, index) =>
                  regExp.test(line) ? [`${file}:${index + 1}:${line}`] : []
                )
            )
        )
        const lines = matches.flat()
        return withNote(
          files,
          lines.length === 0
            ? "No matches."
            : takeLines(lines.join("\n"), maxSearchLines)
        )
      },
    }),
  }
}
