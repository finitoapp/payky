import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

/**
 * The service worker precaches what `globPatterns` in `vite.config.ts`
 * lists. The app starts from that cache for as long as the user does not
 * accept an update, while a deploy removes the old hashed files from the
 * server, so an asset the app loads at start and the glob misses leaves the
 * installed PWA on a black screen (the SQLite `.wasm` did, issue #162).
 */
describe("PWA precache", () => {
  const config = readFileSync(
    path.resolve(import.meta.dirname, "../vite.config.ts"),
    "utf8"
  )
  const globPatterns = /globPatterns:\s*\["([^"]+)"\]/u.exec(config)?.[1] ?? ""
  const extensions = /\{([^}]+)\}/u.exec(globPatterns)?.[1]?.split(",") ?? []

  it.each(["wasm", "js", "css", "html"])("precaches .%s files", (extension) => {
    expect(extensions).toContain(extension)
  })
})
