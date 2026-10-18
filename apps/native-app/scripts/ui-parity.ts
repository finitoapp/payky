// Prints how a native screen's kit components compare with its web
// counterpart, as the starting point of a UI step:
//   bun run --cwd apps/native-app ui-parity [src/features/...tsx]
// Without an argument it reports every pending entry. Not bundled.

import { readFileSync } from "node:fs"
import path from "node:path"
import { type KitElement, kitElements } from "../src/ui-parity/ui-parity.ts"
import { uiParityMap } from "../src/ui-parity/ui-parity-map.ts"

const repoRoot = path.resolve(import.meta.dirname, "../../..")

const elementsOf = (file: string): ReadonlyArray<KitElement> =>
  kitElements(file, readFileSync(path.join(repoRoot, file), "utf8"))

const names = (elements: ReadonlyArray<KitElement>) =>
  new Set(elements.map((element) => element.name))

const outline = (file: string, elements: ReadonlyArray<KitElement>) => {
  console.log(`  ${file}`)
  for (const { name, line, depth, props } of elements) {
    const shown = Object.entries(props)
      .map(([key, value]) => `${key}=${value}`)
      .join(" ")
    console.log(
      `    ${String(line).padStart(4)} ${"  ".repeat(depth)}${name} ${shown}`
    )
  }
}

const sorted = (values: Iterable<string>) =>
  [...values].sort().join(", ") || "-"

const argument = process.argv[2]?.replace(/^apps\/native-app\//u, "")
const entries = uiParityMap.filter((entry) =>
  argument === undefined
    ? entry.status === "pending"
    : entry.native === argument
)
if (entries.length === 0) {
  console.error(`No ui-parity-map entry for ${argument ?? "pending screens"}`)
  process.exit(1)
}

for (const entry of entries) {
  const nativeFile = `apps/native-app/${entry.native}`
  const native = elementsOf(nativeFile)
  const web = entry.web.map((file) => [file, elementsOf(file)] as const)
  const webNames = new Set(web.flatMap(([, elements]) => [...names(elements)]))
  const nativeNames = names(native)
  console.log(`\n${entry.native} (${entry.status})`)
  if (entry.note !== undefined) console.log(`  note: ${entry.note}`)
  console.log(`  web:     ${sorted(webNames)}`)
  console.log(`  native:  ${sorted(nativeNames)}`)
  console.log(
    `  missing: ${sorted([...webNames].filter((name) => !nativeNames.has(name)))}`
  )
  console.log(
    `  extra:   ${sorted([...nativeNames].filter((name) => !webNames.has(name)))}`
  )
  for (const [name, reason] of Object.entries(entry.allowedDifferences ?? {}))
    console.log(`  allowed: ${name} (${reason})`)
  console.log("  outline:")
  for (const [file, elements] of web) outline(file, elements)
  outline(nativeFile, native)
}
