import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, test } from "vitest"

/**
 * Linky's four tables live in Payky's app database but hold Linky's rows
 * under Linky's owners (cashu.md §2). Every query over them must filter by
 * the owner ids it expects, and only the shard store may write them, or a row
 * lands in Payky's owner where Linky never sees it. All queries share one
 * `createQuery`, so the guard is a source scan: a table name may appear only
 * in the files allowed to touch these tables.
 */

const repoRoot = path.resolve(import.meta.dirname, "../../../..")

const linkyTables = ["cashuProof", "cashuOperation", "shardPointer", "setting"]

const allowed = [
  "src/core/modules/cashu/",
  "src/core/cashu/cashu-shard-store.ts",
  "src/core/evolu/schema.ts",
]

const scannedRoots = ["src", "bin", "api", "e2e"]

const sourceFiles = scannedRoots.flatMap((root) =>
  readdirSync(path.join(repoRoot, root), { recursive: true })
    .map(String)
    .filter((file) => /\.tsx?$/u.test(file))
    .map((file) => path.join(root, file).split(path.sep).join("/"))
)

const tableName = new RegExp(`["'\`](?:${linkyTables.join("|")})["'\`]`, "u")

describe("Linky's tables are isolated", () => {
  test("their names appear only in the shard store, the Cashu module and the schema", () => {
    const offenders = sourceFiles.filter(
      (file) =>
        !allowed.some((prefix) => file.startsWith(prefix)) &&
        tableName.test(readFileSync(path.join(repoRoot, file), "utf8"))
    )
    expect(offenders).toEqual([])
  })

  test("the scan sees the files that do name them", () => {
    expect(
      sourceFiles.filter((file) =>
        tableName.test(readFileSync(path.join(repoRoot, file), "utf8"))
      )
    ).toContain("src/core/modules/cashu/cashu-table-isolation.test.ts")
  })
})
