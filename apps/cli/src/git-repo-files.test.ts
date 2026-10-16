import { describe, expect, test } from "vitest"
import { createGitRepoFiles } from "./git-repo-files.ts"
import { repositoryRoot } from "./paths.ts"

describe("createGitRepoFiles", () => {
  const loadFiles = createGitRepoFiles(repositoryRoot)

  test("reads a tracked text file", async () => {
    const files = await loadFiles()
    expect((await files.read("package.json"))?.split("\n")[0]).toBe("{")
  })

  test("refuses a path git does not track, so it cannot leave the repository", async () => {
    const files = await loadFiles()
    for (const path of [
      "../package.json",
      ".env",
      "node_modules/ai/package.json",
    ]) {
      expect(await files.read(path)).toBeNull()
    }
  })

  test("leaves binary files out", async () => {
    const { paths } = await loadFiles()
    for (const path of [
      "AGENTS.md",
      "docs/glossary.md",
      "apps/web-app/src/main.tsx",
      "apps/cli/src/cli.ts",
      "packages/core/src/deps.ts",
    ])
      expect(paths).toContain(path)
    expect(paths.some((path) => path.endsWith(".png"))).toBe(false)
  })
})
