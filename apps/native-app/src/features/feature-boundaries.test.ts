import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { expect, test } from "vitest"

/**
 * The web app's rule for the native features too: a feature never imports a
 * sibling feature's folder; what two features need lives in
 * `src/features/shared`.
 */

const featuresDir = import.meta.dirname

const importSpecifiers = (source: string): ReadonlyArray<string> =>
  [
    ...source.matchAll(
      /(?:\bfrom\s+|\bimport\s*\(\s*|^\s*import\s+)["']([^"']+)["']/gmu
    ),
  ].flatMap((match) => (match[1] === undefined ? [] : [match[1]]))

const crossFeatureImports = readdirSync(featuresDir, { recursive: true })
  .map(String)
  .filter((file) => /\.tsx?$/u.test(file))
  .flatMap((file) => {
    const owner = file.split(path.sep)[0]
    if (owner === undefined || owner === file) return []
    const absolute = path.join(featuresDir, file)
    return importSpecifiers(readFileSync(absolute, "utf8")).flatMap(
      (specifier) => {
        if (!specifier.startsWith(".")) return []
        const relative = path.relative(
          featuresDir,
          path.resolve(path.dirname(absolute), specifier)
        )
        if (relative.startsWith("..")) return []
        const target = relative.split(path.sep)[0]
        return target === owner || target === "shared"
          ? []
          : [`src/features/${file} imports ${specifier}`]
      }
    )
  })

test("no feature imports a sibling feature", () => {
  expect(crossFeatureImports).toEqual([])
})
