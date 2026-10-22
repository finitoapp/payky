import { readFileSync } from "node:fs"
import { expect, it } from "vitest"

const read = (file: string) =>
  readFileSync(new URL(file, import.meta.url), "utf8")
const plugin = read("../../plugins/with-hardware-key-events.cjs")

it("listens for the event the MainActivity plugin emits", () => {
  const event = /HARDWARE_KEY_EVENT = "([^"]+)"/u.exec(
    read("./hardware-keys.ts")
  )?.[1]
  expect(event).toBeDefined()
  expect(plugin).toContain(`const MARKER = "${event}"`)
})

it("never consumes a key in the plugin, so normal handling is unchanged", () => {
  expect(plugin).toContain("return super.dispatchKeyEvent(event)")
  expect(plugin).not.toContain("return true")
})

it("names the keys the keypad reads as web's KeyboardEvent.key does", () => {
  for (const name of ["Enter", "Backspace", "Delete", "Escape", "Shift"]) {
    expect(plugin).toContain(`-> "${name}"`)
  }
})
