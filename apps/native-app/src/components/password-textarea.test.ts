import { readFileSync } from "node:fs"
import { expect, it } from "vitest"

it("keeps a secret out of the keyboard's suggestions, learning and autofill in both states", () => {
  const source = readFileSync(
    new URL("./password-textarea.tsx", import.meta.url),
    "utf8"
  )
  expect(source).not.toMatch(
    /console\.|Clipboard|AsyncStorage|SecureStore|MMKV/u
  )
  // The caller's props come first, so they cannot turn these back on.
  const fixed = source.slice(source.indexOf("{...props}"))
  for (const prop of [
    "secureTextEntry={!shown}",
    '"visible-password"',
    'autoComplete="off"',
    'importantForAutofill="no"',
    "autoCorrect={false}",
    "spellCheck={false}",
  ]) {
    expect(fixed).toContain(prop)
  }
})
