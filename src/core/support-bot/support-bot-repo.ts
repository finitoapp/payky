import { execFile } from "node:child_process"
import { access } from "node:fs/promises"
import { join } from "node:path"
import { promisify } from "node:util"
import { tool } from "ai"
import { z } from "zod"

/**
 * The support bot's own clone of Payky's public repository, in a directory
 * of its own and apart from the code the bot runs from (support/0004). The
 * bot reads it at the commit the merchant's app was built from, so it
 * explains the app the merchant has rather than the newest one. It only
 * ever reads through git, so the conversations of merchants on different
 * versions never share a checkout.
 */

const runFile = promisify(execFile)

/** The branch the clone tracks: docs are read from there. */
const DEFAULT_REVISION = "origin/HEAD"
/** A commit unknown to the clone is fetched for at most this often. */
const FETCH_INTERVAL_MS = 60_000
const MAX_LIST_ENTRIES = 500
const MAX_READ_LINES = 400
const MAX_SEARCH_LINES = 200
/** What the app's trailer names: the short hash of its commit. */
const CommitHashSchema = z.string().regex(/^[0-9a-f]{7,40}$/u)

export interface RepoRevision {
  readonly revision: string
  /** The merchant's own commit, rather than the default branch. */
  readonly exact: boolean
}

export interface SupportBotRepo {
  /** Clones the repository on the first start, fetches on every later one. */
  readonly sync: () => Promise<void>
  /** Every Markdown file under `docs/` on the default branch. */
  readonly docs: () => Promise<ReadonlyArray<RepoFile>>
  /** `AGENTS.md` at `revision`, the map of the codebase, or "". */
  readonly agentsGuide: (revision: string) => Promise<string>
  /** The commit the app's trailer names, or the default branch. */
  readonly resolveRevision: (version: string | null) => Promise<RepoRevision>
  readonly listFiles: (revision: string, path: string) => Promise<string>
  readonly readFile: (
    revision: string,
    path: string,
    startLine: number
  ) => Promise<string>
  readonly searchCode: (
    revision: string,
    pattern: string,
    path: string
  ) => Promise<string>
}

export interface RepoFile {
  readonly path: string
  readonly content: string
}

/**
 * A path the model asks for, inside the repository: relative, without `..`,
 * and never starting with `-`, so git cannot read it as an option.
 */
const toRepoPath = (path: string): string | null => {
  const trimmed = path.trim().replace(/^\.\//u, "").replace(/\/+$/u, "")
  if (
    trimmed.startsWith("-") ||
    trimmed.startsWith("/") ||
    trimmed.split("/").includes("..")
  ) {
    return null
  }
  return trimmed
}

const isGitFailure = (
  error: unknown
): error is { readonly code: number; readonly stderr: string } =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  typeof error.code === "number"

export const createSupportBotRepo = ({
  url,
  directory,
  now = Date.now,
}: {
  readonly url: string
  readonly directory: string
  readonly now?: () => number
}): SupportBotRepo => {
  const git = async (
    args: ReadonlyArray<string>,
    cwd = directory
  ): Promise<string> => {
    const { stdout } = await runFile("git", [...args], {
      cwd,
      maxBuffer: 32 * 1024 * 1024,
      timeout: 120_000,
    })
    return stdout
  }
  /** Runs git and turns a failure into the message the model reads. */
  const gitForModel = async (
    args: ReadonlyArray<string>,
    { noMatch = "" }: { readonly noMatch?: string } = {}
  ): Promise<string> => {
    try {
      return await git(args)
    } catch (error) {
      if (isGitFailure(error)) {
        // git grep exits with 1 when nothing matched.
        if (error.code === 1 && error.stderr === "") return noMatch
        return `Error: ${error.stderr.trim() || `git exited with ${error.code}`}`
      }
      throw error
    }
  }

  let lastFetchAt = Number.NEGATIVE_INFINITY
  const fetch = async () => {
    lastFetchAt = now()
    await git(["fetch", "--quiet", "--prune", "origin"])
  }

  const hasCommit = async (revision: string) => {
    try {
      await git(["cat-file", "-e", `${revision}^{commit}`])
      return true
    } catch {
      return false
    }
  }

  let docsCache:
    | { readonly commit: string; readonly files: ReadonlyArray<RepoFile> }
    | undefined

  return {
    sync: async () => {
      try {
        await access(join(directory, ".git"))
      } catch {
        await git(["clone", "--quiet", url, directory], ".")
        lastFetchAt = now()
        return
      }
      await fetch()
    },

    docs: async () => {
      const commit = (await git(["rev-parse", DEFAULT_REVISION])).trim()
      if (docsCache?.commit === commit) return docsCache.files
      const paths = (
        await git(["ls-tree", "-r", "--name-only", commit, "--", "docs"])
      )
        .split("\n")
        .filter((path) => path.endsWith(".md"))
      const files = await Promise.all(
        paths.map(async (path) => ({
          path,
          content: await git(["show", `${commit}:${path}`]),
        }))
      )
      docsCache = { commit, files }
      return files
    },

    agentsGuide: (revision) =>
      git(["show", `${revision}:AGENTS.md`]).catch(() => ""),

    resolveRevision: async (version) => {
      const commit = CommitHashSchema.safeParse(version)
      if (!commit.success) return { revision: DEFAULT_REVISION, exact: false }
      if (await hasCommit(commit.data)) {
        return { revision: commit.data, exact: true }
      }
      if (now() - lastFetchAt >= FETCH_INTERVAL_MS) {
        await fetch()
        if (await hasCommit(commit.data)) {
          return { revision: commit.data, exact: true }
        }
      }
      // A build from a commit that never reached the repository.
      return { revision: DEFAULT_REVISION, exact: false }
    },

    listFiles: async (revision, path) => {
      const repoPath = toRepoPath(path)
      if (repoPath === null) return "Error: not a path inside the repository."
      const listing = await gitForModel([
        "ls-tree",
        revision,
        "--",
        repoPath === "" ? "." : `${repoPath}/`,
      ])
      if (listing.startsWith("Error:")) return listing
      const entries = listing.split("\n").flatMap((line) => {
        const [meta = "", name] = line.split("\t")
        if (name === undefined) return []
        return [meta.split(" ")[1] === "tree" ? `${name}/` : name]
      })
      if (entries.length === 0) return "No such directory."
      return entries.length > MAX_LIST_ENTRIES
        ? `${entries.slice(0, MAX_LIST_ENTRIES).join("\n")}\n… ${entries.length - MAX_LIST_ENTRIES} more`
        : entries.join("\n")
    },

    readFile: async (revision, path, startLine) => {
      const repoPath = toRepoPath(path)
      if (repoPath === null || repoPath === "") {
        return "Error: not a file inside the repository."
      }
      const content = await gitForModel(["show", `${revision}:${repoPath}`])
      if (content.startsWith("Error:")) return content
      const lines = content.split("\n")
      const first = Math.max(1, Math.floor(startLine))
      const window = lines
        .slice(first - 1, first - 1 + MAX_READ_LINES)
        .map((line, index) => `${first + index}\t${line}`)
      const last = first - 1 + window.length
      return last < lines.length
        ? `${window.join("\n")}\n… lines ${last + 1}–${lines.length} not shown; read again from line ${last + 1}.`
        : window.join("\n")
    },

    searchCode: async (revision, pattern, path) => {
      const repoPath = toRepoPath(path)
      if (repoPath === null) return "Error: not a path inside the repository."
      const output = await gitForModel(
        [
          "grep",
          "-n",
          "-I",
          "-E",
          "--max-count=20",
          "-e",
          pattern,
          revision,
          "--",
          ...(repoPath === "" ? [] : [repoPath]),
        ],
        { noMatch: "No match." }
      )
      if (output.startsWith("Error:") || output === "No match.") return output
      const lines = output
        .split("\n")
        .filter((line) => line !== "")
        .map((line) =>
          line.startsWith(`${revision}:`)
            ? line.slice(revision.length + 1)
            : line
        )
      return lines.length > MAX_SEARCH_LINES
        ? `${lines.slice(0, MAX_SEARCH_LINES).join("\n")}\n… ${lines.length - MAX_SEARCH_LINES} more matches; narrow the pattern or the path.`
        : lines.join("\n")
    },
  }
}

/**
 * The read-only tools the model explores the code with, all at the
 * merchant's revision. They run git with arguments, never a shell, and see
 * only the public repository, so a prompt injection can at worst read code
 * anyone can read.
 */
export const createRepoTools = (repo: SupportBotRepo, revision: string) => ({
  list_files: tool({
    description:
      "List the files and directories in a directory of the Payky repository. Directories end with /. Use an empty path for the root.",
    inputSchema: z.object({
      path: z.string().describe("Directory relative to the repository root."),
    }),
    execute: ({ path }) => repo.listFiles(revision, path),
  }),
  read_file: tool({
    description: `Read a file of the Payky repository, ${MAX_READ_LINES} numbered lines at a time.`,
    inputSchema: z.object({
      path: z.string().describe("File path relative to the repository root."),
      startLine: z
        .number()
        .int()
        .min(1)
        .describe("The first line to read, 1 for the start of the file."),
    }),
    execute: ({ path, startLine }) => repo.readFile(revision, path, startLine),
  }),
  search_code: tool({
    description:
      "Search the Payky repository with an extended regular expression (git grep -E). Returns path:line:text, at most 20 matches per file.",
    inputSchema: z.object({
      pattern: z.string().min(1).describe("Extended regular expression."),
      path: z
        .string()
        .describe(
          "Directory or file to search in, relative to the repository root; empty for everywhere."
        ),
    }),
    execute: ({ pattern, path }) => repo.searchCode(revision, pattern, path),
  }),
})
