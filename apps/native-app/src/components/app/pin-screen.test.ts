import { readFileSync } from "node:fs"
import { expect, it } from "vitest"

const read = (path: string) =>
  readFileSync(new URL(path, import.meta.url), "utf8")

const forbidden = /console\.|Clipboard|AsyncStorage|SecureStore|MMKV/u

it("enters the PIN on an in-app keypad and keeps it only in component state", () => {
  const source = read("./pin-screen.tsx")
  expect(source).not.toMatch(forbidden)
  const pad = source.slice(
    source.indexOf("function PinPad"),
    source.indexOf("function PhraseForm")
  )
  expect(pad).not.toMatch(/TextInput|<Input/u)
  expect(pad).toMatch(/onSubmit\(pin\)\s+setPin\(""\)/u)
})

it("takes the recovery phrase with every keyboard aid off", () => {
  const source = read("./pin-screen.tsx")
  const form = source.slice(
    source.indexOf("function PhraseForm"),
    source.indexOf("function FailedAttempts")
  )
  for (const prop of [
    "secureTextEntry",
    'autoComplete="off"',
    "autoCorrect={false}",
    "spellCheck={false}",
  ]) {
    expect(form).toContain(prop)
  }
})

it("keeps the one-time code out of the clipboard, suggestions and autofill", () => {
  const source = read("../ui/input-otp.tsx")
  expect(source).not.toMatch(forbidden)
  expect(source).not.toMatch(/useRef/u)
  for (const prop of [
    "contextMenuHidden",
    'importantForAutofill="no"',
    'autoComplete="off"',
    "autoCorrect={false}",
    "spellCheck={false}",
  ]) {
    expect(source).toContain(prop)
  }
})
