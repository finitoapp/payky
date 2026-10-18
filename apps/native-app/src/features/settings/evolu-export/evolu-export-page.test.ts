import { readFileSync } from "node:fs"
import { expect, it } from "vitest"
import { requiredPermission } from "../../../core/route-access.ts"

const read = (name: string) =>
  readFileSync(new URL(`./${name}`, import.meta.url), "utf8")

it("keeps the export owner-only", () => {
  expect(requiredPermission("/settings/evolu-export")).toBe("admin")
})

it("awaits the permission before serializing, then shares", () => {
  const page = read("evolu-export-page.tsx")
  const require = page.indexOf(
    'await require("admin", "access.action.exportDatabase")'
  )
  const serialize = page.indexOf("await evolu.exportDatabase()")
  const share = page.indexOf("await shareEvoluExport(")
  expect(require).toBeGreaterThan(-1)
  expect(require).toBeLessThan(serialize)
  expect(serialize).toBeLessThan(share)
  expect(page.match(/evolu\.exportDatabase\(\)/g)).toHaveLength(1)
})

it("removes the temp folder in a finally and logs or stores nothing", () => {
  const share = read("evolu-export-share.ts")
  expect(share).toMatch(/finally \{\s*try \{\s*io\.removeTemp\(folder\)/u)
  const io = read("evolu-export-io.ts")
  expect(io).toMatch(/new Directory\(Paths\.cache, folder\)/)
  expect(io).not.toMatch(/Paths\.document|Paths\.bundle|Directory\.pictures/u)
  for (const source of [share, io, read("evolu-export-page.tsx")]) {
    expect(source).not.toMatch(
      /console\.|Clipboard|localStorage|AsyncStorage|SecureStore|MMKV|Blob|URL\.createObjectURL/u
    )
  }
})
