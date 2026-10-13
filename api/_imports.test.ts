import { existsSync, readdirSync, readFileSync } from "node:fs"
import { dirname, join, normalize } from "node:path"
import { describe, expect, test } from "vitest"

/**
 * Vercel compiles each `api/` function and what it imports from `.ts` to
 * `.js` but leaves import specifiers as written, and Node's ESM loader
 * resolves no aliases. A `./x.ts` or `@/x` import anywhere in that graph
 * passes typecheck and the unit tests, then fails in production with
 * ERR_MODULE_NOT_FOUND.
 */
const importSpecifiers = (source: string): ReadonlyArray<string> =>
  Array.from(
    source.matchAll(
      /(?:^|\n)\s*(?:import|export)\s[^"']*?from\s+["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g
    ),
    (match) => match[1] ?? match[2] ?? ""
  )

const entryPoints = (dir: string): ReadonlyArray<string> =>
  readdirSync(dir, { recursive: true, encoding: "utf8" })
    .filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts"))
    .map((file) => join(dir, file))

const unresolvableImports = (): ReadonlyArray<string> => {
  const seen = new Set<string>()
  const problems: string[] = []
  const visit = (file: string) => {
    if (seen.has(file)) return
    seen.add(file)
    for (const specifier of importSpecifiers(readFileSync(file, "utf8"))) {
      if (specifier.startsWith("@/")) {
        problems.push(`${file}: ${specifier}`)
        continue
      }
      if (!specifier.startsWith(".")) continue
      if (!specifier.endsWith(".js")) problems.push(`${file}: ${specifier}`)
      const target = normalize(
        join(dirname(file), specifier.replace(/\.(js|ts)$/u, ".ts"))
      )
      if (existsSync(target)) visit(target)
    }
  }
  for (const file of entryPoints("api")) visit(file)
  return problems
}

describe("api imports", () => {
  test("import every relative module as .js and use no path alias", () => {
    expect(unresolvableImports()).toEqual([])
  })
})
