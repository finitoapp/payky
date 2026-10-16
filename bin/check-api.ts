import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs"
import { join, resolve } from "node:path"

const repositoryRoot = resolve(import.meta.dirname, "..")
const webRoot = join(repositoryRoot, "apps/web-app")
const temporaryRoot = join(webRoot, ".tmp")
mkdirSync(temporaryRoot, { recursive: true })
const output = mkdtempSync(join(temporaryRoot, "api-loader-"))
const entries = readdirSync(join(webRoot, "api"), { recursive: true })
  .map(String)
  .filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts"))
  .map((file) => join(webRoot, "api", file))

try {
  execFileSync("bun", ["run", "build:core"], {
    cwd: repositoryRoot,
    stdio: "inherit",
  })
  execFileSync(
    "bun",
    [
      "build",
      ...entries,
      "--target=node",
      "--packages=external",
      "--outdir",
      output,
      "--entry-naming",
      "[dir]/[name].mjs",
    ],
    { cwd: webRoot, stdio: "inherit" }
  )
  const modules = readdirSync(output, { recursive: true })
    .map(String)
    .filter((file) => file.endsWith(".mjs"))
  for (const file of modules) {
    execFileSync(
      "node",
      [
        "--input-type=module",
        "--eval",
        "await import(process.argv[1])",
        join(output, file),
      ],
      { cwd: webRoot, stdio: "inherit" }
    )
  }
  console.log(
    `${modules.length} API modules load with Node and emitted core exports.`
  )
} finally {
  rmSync(output, { recursive: true, force: true })
}
