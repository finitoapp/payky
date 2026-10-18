import { readFileSync } from "node:fs"
import { expect, it } from "vitest"

const read = (name: string) =>
  readFileSync(new URL(`./${name}`, import.meta.url), "utf8")

const expectInOrder = (source: string, ...patterns: ReadonlyArray<RegExp>) => {
  let remainder = source
  for (const pattern of patterns) {
    const match = remainder.match(pattern)
    expect(match, `missing ${pattern}`).not.toBeNull()
    if (match === null) return
    if (match.index === undefined) throw new Error(`no index for ${pattern}`)
    remainder = remainder.slice(match.index + match[0].length)
  }
}

it("asks for confirmation, awaited, before removing a device, and never for this one", () => {
  const item = read("device-item.tsx")
  expectInOrder(
    item,
    /const remove = async/,
    /await confirm\(/,
    /if \(!confirmed\) return/,
    /await run\.ok\(removeDevice\(device\.id\)\)/
  )
  expect(item).toMatch(
    /\{thisDevice \? null : \(\s*<AppButton\s+variant="destructive"/u
  )
})

it("edits device permissions only through the core action, from the presets and permissions core defines", () => {
  const item = read("device-item.tsx")
  expect(item).toMatch(
    /setDeviceDefaultPermissions\(\{ id: device\.id, permissions: granted \}\)/
  )
  expect(item).toMatch(/accessPresets\[preset\]/)
  expect(item).toMatch(/permissions\.map\(\(permission\)/)
})
