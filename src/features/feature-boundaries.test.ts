import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, test } from "vitest"

/**
 * Holds AGENTS.md's rule that a feature never imports a sibling feature's
 * folder: what two features need lives in `src/features/shared` (or
 * `src/components`, `src/hooks`, which in turn import no feature). Nothing else enforced it, and 38 such
 * imports with three folder cycles had piled up before they were cleaned out.
 */

const featuresDir = import.meta.dirname

/** Every specifier in an `import … from`, `export … from` or `import()`. */
const importSpecifiers = (source: string): ReadonlyArray<string> =>
  [
    ...source.matchAll(
      /(?:\bfrom\s+|\bimport\s*\(\s*|^\s*import\s+)["']([^"']+)["']/gmu
    ),
  ].flatMap((match) => (match[1] === undefined ? [] : [match[1]]))

/** The feature folder a specifier resolves into, or `null` outside them. */
const targetFeature = (fromFile: string, specifier: string): string | null => {
  const resolved = specifier.startsWith("@/features/")
    ? path.join(featuresDir, specifier.slice("@/features/".length))
    : specifier.startsWith(".")
      ? path.resolve(path.dirname(fromFile), specifier)
      : null
  if (resolved === null) return null

  const relative = path.relative(featuresDir, resolved)
  if (relative.startsWith("..") || path.isAbsolute(relative)) return null
  return relative.split(path.sep)[0] ?? null
}

const sourceFiles = readdirSync(featuresDir, { recursive: true })
  .map(String)
  .filter((file) => /\.tsx?$/u.test(file))

const crossFeatureImports = sourceFiles.flatMap((file) => {
  const owner = file.split(path.sep)[0]
  const absolute = path.join(featuresDir, file)
  // A file directly in src/features (this test) belongs to no feature.
  if (owner === undefined || owner === file) return []

  return importSpecifiers(readFileSync(absolute, "utf8")).flatMap(
    (specifier) => {
      const target = targetFeature(absolute, specifier)
      return target === null || target === owner || target === "shared"
        ? []
        : [`src/features/${file} imports ${specifier}`]
    }
  )
})

/**
 * `src/components` and `src/hooks` sit below the features: a feature uses
 * them, never the other way round.
 */
const layerImports = (["components", "hooks"] as const).flatMap((layer) => {
  const layerDir = path.join(featuresDir, "..", layer)
  return readdirSync(layerDir, { recursive: true })
    .map(String)
    .filter((file) => /\.tsx?$/u.test(file))
    .flatMap((file) => {
      const absolute = path.join(layerDir, file)
      return importSpecifiers(readFileSync(absolute, "utf8")).flatMap(
        (specifier) =>
          targetFeature(absolute, specifier) === null
            ? []
            : [`src/${layer}/${file} imports ${specifier}`]
      )
    })
})

describe("feature boundaries", () => {
  test("finds the feature sources", () => {
    expect(sourceFiles.length).toBeGreaterThan(100)
  })

  test("no feature imports another feature's folder", () => {
    expect(crossFeatureImports).toEqual([])
  })

  test("src/components and src/hooks import no feature", () => {
    expect(layerImports).toEqual([])
  })
})
