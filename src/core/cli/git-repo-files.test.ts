import { describe, expect, test } from "vitest"
import { createGitRepoFiles } from "./git-repo-files.ts"

describe("createGitRepoFiles", () => {
  const loadFiles = createGitRepoFiles(process.cwd())

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
    expect(paths).toContain("AGENTS.md")
    expect(paths.some((path) => path.endsWith(".png"))).toBe(false)
  })
})
