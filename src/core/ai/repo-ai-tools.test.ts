import { describe, expect, test } from "vitest"
import { createRepoAiTools, type RepoFiles } from "./repo-ai-tools.ts"

const options = { toolCallId: "call-1", messages: [], context: {} }

const files: Readonly<Record<string, string>> = {
  "docs/decisions/ai/0001-proxy.md": "# 0001 Proxy\n\nStatus: accepted",
  "src/app.ts": "export const answer = 42",
}

const createTools = (note: string | null = null) =>
  createRepoAiTools(
    async (): Promise<RepoFiles> => ({
      paths: Object.keys(files),
      read: async (path) => files[path] ?? null,
      note,
    })
  )

describe("createRepoAiTools", () => {
  test("lists the files under a prefix", async () => {
    expect(
      await createTools().listFiles.execute?.({ prefix: "docs/" }, options)
    ).toBe("docs/decisions/ai/0001-proxy.md")
  })

  test("reads a file with line numbers", async () => {
    expect(
      await createTools().readFile.execute?.(
        { path: "docs/decisions/ai/0001-proxy.md", fromLine: 3, toLine: 3 },
        options
      )
    ).toBe("3: Status: accepted")
  })

  test("refuses a path that is not a repository file", async () => {
    expect(
      await createTools().readFile.execute?.({ path: ".env" }, options)
    ).toEqual({ error: "Not a repository file: .env" })
  })

  test("searches case-insensitively under a prefix", async () => {
    const tools = createTools()
    expect(
      await tools.searchCode.execute?.({ pattern: "ANSWER = \\d+" }, options)
    ).toBe("src/app.ts:1:export const answer = 42")
    expect(
      await tools.searchCode.execute?.(
        { pattern: "answer", path: "docs/" },
        options
      )
    ).toBe("No matches.")
    expect(
      await tools.searchCode.execute?.({ pattern: "(" }, options)
    ).toHaveProperty("error")
  })

  test("puts the note before every result", async () => {
    expect(
      await createTools("Note: older code.").listFiles.execute?.(
        { prefix: "src/" },
        options
      )
    ).toBe("Note: older code.\nsrc/app.ts")
  })
})
