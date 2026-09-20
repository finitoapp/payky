import { execFileSync } from "node:child_process"
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs"
import path from "node:path"
import { z } from "zod"

/**
 * Re-vendors the Linky packages Payky builds on from a Linky checkout into
 * `packages/` (`src/core/linky/profile-name.ts` is a plain copy of one Linky
 * module and is kept in sync by hand). They cannot be `file:`/`link:` dependencies: Bun resolves a
 * linked package's `workspace:*` devDependencies (which only the Linky
 * monorepo can satisfy), and CI, Vercel and Codemagic build this repo on its
 * own, without a sibling checkout. So the sources are copied, minus tests,
 * and the origin commit is pinned in each package's `SOURCE.json`.
 *
 *   bun run sync:linky                # from ../linky
 *   bun run sync:linky /path/to/linky
 *
 * Vendored:
 * - `@linky/linkshu`  — the cashu wallet library (`packages/linkshu`)
 * - `@linky/linksync` — the shard store over Evolu **7** (`packages/linksync`).
 *   Linky runs Evolu 7 and its relay is pinned to it; Evolu 8 (Payky's own
 *   store) changed the wire encoding, so the copy imports the aliased
 *   `@evolu-v7/common` instead of `@evolu/common`.
 */

const SourcePackageJson = z.object({
  name: z.string(),
  version: z.string(),
  license: z.string(),
  type: z.literal("module"),
  main: z.string(),
  types: z.string(),
  exports: z.record(z.string(), z.string()),
  dependencies: z.record(z.string(), z.string()).default({}),
  peerDependencies: z.record(z.string(), z.string()).optional(),
})

const repoRoot = path.resolve(import.meta.dirname, "..")
const linkyRoot = path.resolve(
  repoRoot,
  process.argv[2] ?? path.join("..", "linky")
)

if (!existsSync(path.join(linkyRoot, "packages", "linkshu", "package.json"))) {
  console.error(`No Linky checkout at ${linkyRoot}`)
  process.exit(1)
}

const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: linkyRoot,
  encoding: "utf8",
}).trim()

// Linky's compiler options (no `noUncheckedIndexedAccess`), emitted as
// declarations the app consumes through a project reference.
const vendoredTsconfig = (extra: Record<string, unknown> = {}) => ({
  compilerOptions: {
    composite: true,
    declaration: true,
    emitDeclarationOnly: true,
    outDir: "./dist",
    rootDir: "./src",
    tsBuildInfoFile: "./dist/tsconfig.tsbuildinfo",
    target: "ES2023",
    lib: ["ES2023", "DOM"],
    module: "ESNext",
    moduleResolution: "bundler",
    verbatimModuleSyntax: true,
    moduleDetection: "force",
    skipLibCheck: true,
    strict: true,
    exactOptionalPropertyTypes: true,
    noUnusedLocals: true,
    noUnusedParameters: true,
    erasableSyntaxOnly: true,
    noFallthroughCasesInSwitch: true,
    noUncheckedSideEffectImports: true,
    ...extra,
  },
  include: ["src"],
})

const writeJson = (file: string, value: unknown): void => {
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`)
}

const writeSourceJson = (targetDir: string, sourcePath: string): void => {
  writeJson(path.join(targetDir, "SOURCE.json"), {
    repository: "https://github.com/gorrdy/linky",
    path: sourcePath,
    commit: sourceCommit,
    syncedAt: new Date().toISOString(),
    syncedWith: "bun run sync:linky",
  })
}

const isVendoredSourceFile = (sourceDir: string, source: string): boolean => {
  const relative = path.relative(sourceDir, source)
  if (relative === "" || relative === "src") return true
  if (relative.startsWith(path.join("src", "testing"))) return false
  return !relative.endsWith(".test.ts")
}

const rewriteSources = (
  dir: string,
  rewrite: (source: string) => string
): void => {
  for (const entry of readdirSync(dir)) {
    const file = path.join(dir, entry)
    if (statSync(file).isDirectory()) {
      rewriteSources(file, rewrite)
    } else if (file.endsWith(".ts")) {
      writeFileSync(file, rewrite(readFileSync(file, "utf8")))
    }
  }
}

const vendorPackage = ({
  sourcePath,
  targetName,
  dependencies,
  peerDependencies,
  rewrite,
  tsconfigExtra,
}: {
  readonly sourcePath: string
  readonly targetName: string
  readonly dependencies?: (
    source: Record<string, string>
  ) => Record<string, string>
  readonly peerDependencies?: Record<string, string>
  readonly rewrite?: (source: string) => string
  readonly tsconfigExtra?: Record<string, unknown>
}): void => {
  const sourceDir = path.join(linkyRoot, sourcePath)
  const targetDir = path.join(repoRoot, "packages", targetName)
  const sourcePackage = SourcePackageJson.parse(
    JSON.parse(readFileSync(path.join(sourceDir, "package.json"), "utf8"))
  )

  rmSync(targetDir, { recursive: true, force: true })
  mkdirSync(targetDir, { recursive: true })
  cpSync(path.join(sourceDir, "src"), path.join(targetDir, "src"), {
    recursive: true,
    filter: (source) => isVendoredSourceFile(sourceDir, source),
  })
  if (rewrite) rewriteSources(path.join(targetDir, "src"), rewrite)
  for (const extra of ["docs", "README.md"]) {
    const source = path.join(sourceDir, extra)
    if (existsSync(source)) {
      cpSync(source, path.join(targetDir, extra), { recursive: true })
    }
  }

  // Only the runtime manifest: the scripts and devDependencies belong to the
  // Linky monorepo (its eslint/prettier config, vitest, the integration mints).
  writeJson(path.join(targetDir, "package.json"), {
    name: sourcePackage.name,
    version: sourcePackage.version,
    private: true,
    license: sourcePackage.license,
    type: sourcePackage.type,
    main: sourcePackage.main,
    types: sourcePackage.types,
    exports: sourcePackage.exports,
    dependencies: dependencies
      ? dependencies(sourcePackage.dependencies)
      : sourcePackage.dependencies,
    ...(peerDependencies ? { peerDependencies } : {}),
  })
  writeJson(
    path.join(targetDir, "tsconfig.json"),
    vendoredTsconfig(tsconfigExtra)
  )
  writeSourceJson(targetDir, sourcePath)

  console.log(
    `Vendored ${sourcePackage.name}@${sourcePackage.version} from ${sourceCommit}`
  )
}

vendorPackage({ sourcePath: "packages/linkshu", targetName: "linkshu" })

vendorPackage({
  sourcePath: "packages/linksync",
  targetName: "linksync",
  rewrite: (source) =>
    source.replaceAll('"@evolu/common"', '"@evolu-v7/common"'),
  dependencies: (source) =>
    Object.fromEntries(
      Object.entries(source).map(([name, range]) =>
        name === "@evolu/common"
          ? ["@evolu-v7/common", `npm:@evolu/common@${range}`]
          : [name, range]
      )
    ),
  peerDependencies: { react: "^19.2.3" },
  tsconfigExtra: { jsx: "react-jsx" },
})
