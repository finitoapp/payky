import { resolve } from "node:path"
import { describe, expect, test } from "vitest"
import { repositoryRoot, resolveSqlitePath } from "./paths.ts"

describe("CLI database paths", () => {
  test("defaults to the repository database regardless of cwd", () => {
    expect(resolveSqlitePath(undefined, "/tmp")).toBe(
      resolve(repositoryRoot, ".data/payky.db")
    )
  })
  test("resolves an explicit relative path against the caller cwd", () => {
    expect(resolveSqlitePath("custom.db", "/tmp/payky")).toBe(
      "/tmp/payky/custom.db"
    )
    expect(resolveSqlitePath("/tmp/absolute.db", repositoryRoot)).toBe(
      "/tmp/absolute.db"
    )
  })
})
