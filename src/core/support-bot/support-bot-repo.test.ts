import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { afterAll, describe, expect, test } from "vitest"

import { createSupportBotRepo } from "./support-bot-repo.ts"

const root = mkdtempSync(join(tmpdir(), "support-bot-repo-"))
const origin = join(root, "origin")

const git = (args: ReadonlyArray<string>, cwd = origin) =>
  execFileSync(
    "git",
    ["-c", "user.name=Test", "-c", "user.email=test@test", ...args],
    { cwd, encoding: "utf8" }
  ).trim()

const commit = (files: Readonly<Record<string, string>>) => {
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(origin, path)), { recursive: true })
    writeFileSync(join(origin, path), content)
  }
  git(["add", "-A"])
  git(["commit", "--quiet", "-m", "change"])
  return git(["rev-parse", "--short", "HEAD"])
}

mkdirSync(origin)
git(["init", "--quiet", "--initial-branch=main"])
const firstCommit = commit({
  "docs/guide.md": "# Guide\n",
  "docs/image.png": "not markdown",
  "AGENTS.md": "# Agents\n",
  "src/fee.ts": `${Array.from({ length: 450 }, (_, index) => `// line ${index + 1}`).join("\n")}\nexport const fee = 1\n`,
})

let clock = 0
const repo = createSupportBotRepo({
  url: origin,
  directory: join(root, "clone"),
  now: () => clock,
})

afterAll(() => rmSync(root, { recursive: true, force: true }))

describe("support bot repo", () => {
  test("clones the repository into its own directory and reads the docs from it", async () => {
    await repo.sync()

    expect(await repo.docs()).toEqual([
      { path: "docs/guide.md", content: "# Guide\n" },
    ])
    expect(await repo.agentsGuide("origin/HEAD")).toBe("# Agents\n")
  })

  test("reads the code at the merchant's commit, fetching one it does not know yet", async () => {
    expect(await repo.resolveRevision(firstCommit)).toEqual({
      revision: firstCommit,
      exact: true,
    })

    const secondCommit = commit({ "src/fee.ts": "export const fee = 2\n" })
    clock = 120_000
    expect(await repo.resolveRevision(secondCommit)).toEqual({
      revision: secondCommit,
      exact: true,
    })
    expect(await repo.searchCode(firstCommit, "fee = ", "src")).toBe(
      "src/fee.ts:451:export const fee = 1"
    )
    expect(await repo.searchCode(secondCommit, "fee = ", "")).toBe(
      "src/fee.ts:1:export const fee = 2"
    )
  })

  test("falls back to the default branch for an unknown commit or a version that is not one", async () => {
    const fallback = { revision: "origin/HEAD", exact: false }

    expect(await repo.resolveRevision("0000000")).toEqual(fallback)
    expect(await repo.resolveRevision("--upload-pack=touch")).toEqual(fallback)
    expect(await repo.resolveRevision(null)).toEqual(fallback)
  })

  test("reads a file in numbered windows and lists directories", async () => {
    const start = await repo.readFile(firstCommit, "src/fee.ts", 1)
    expect(start.split("\n")[0]).toBe("1\t// line 1")
    expect(start).toContain("read again from line 401")

    const rest = await repo.readFile(firstCommit, "./src/fee.ts", 449)
    expect(rest.split("\n")).toEqual([
      "449\t// line 449",
      "450\t// line 450",
      "451\texport const fee = 1",
      "452\t",
    ])
    expect(await repo.listFiles(firstCommit, "")).toBe("AGENTS.md\ndocs/\nsrc/")
  })

  test("refuses paths outside the repository and ones git could read as options", async () => {
    expect(await repo.readFile(firstCommit, "../secret", 1)).toMatch(/^Error:/u)
    expect(await repo.readFile(firstCommit, "/etc/passwd", 1)).toMatch(
      /^Error:/u
    )
    expect(await repo.searchCode(firstCommit, "x", "--output=x")).toMatch(
      /^Error:/u
    )
    expect(await repo.readFile(firstCommit, "missing.ts", 1)).toMatch(
      /^Error:/u
    )
  })
})
