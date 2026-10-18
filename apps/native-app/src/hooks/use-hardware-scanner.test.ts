import { readFileSync } from "node:fs"
import { expect, it } from "vitest"

const read = (file: string) =>
  readFileSync(new URL(file, import.meta.url), "utf8")

it("listens for the event the MainActivity plugin emits", () => {
  const event = /HARDWARE_KEY_EVENT = "([^"]+)"/u.exec(
    read("./use-hardware-scanner.ts")
  )?.[1]
  expect(event).toBeDefined()
  expect(read("../../plugins/with-hardware-key-events.cjs")).toContain(
    `const MARKER = "${event}"`
  )
})

it("never consumes a key in the plugin, so normal handling is unchanged", () => {
  const plugin = read("../../plugins/with-hardware-key-events.cjs")
  expect(plugin).toContain("return super.dispatchKeyEvent(event)")
  expect(plugin).not.toContain("return true")
})
