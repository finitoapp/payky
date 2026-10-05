import { describe, expect, test } from "vitest"
import { createRepoAiTools } from "./repo-ai-tools.ts"

const options = { toolCallId: "call-1", messages: [], context: {} }

describe("repo ai tools", () => {
  const tools = createRepoAiTools(process.cwd())

  test("reads a tracked file with line numbers", async () => {
    const text = await tools.readFile.execute?.(
      { path: "package.json", fromLine: 1, toLine: 1 },
      options
    )
    expect(text).toBe("1: {")
  })

  test("refuses a path git does not track, so it cannot leave the repository", async () => {
    for (const path of [
      "../package.json",
      ".env",
      "node_modules/ai/package.json",
    ]) {
      expect(await tools.readFile.execute?.({ path }, options)).toEqual({
        error: `Not a tracked file: ${path}`,
      })
    }
  })

  test("reports a search without matches", async () => {
    expect(
      await tools.searchCode.execute?.(
        { pattern: "no-such-text-[0-9]{40}", path: "README.md" },
        options
      )
    ).toBe("No matches.")
  })
})
