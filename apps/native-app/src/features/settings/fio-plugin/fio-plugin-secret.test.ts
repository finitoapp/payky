import { readFileSync } from "node:fs"
import { expect, it } from "vitest"

const read = (name: string) =>
  readFileSync(new URL(`./${name}`, import.meta.url), "utf8")

const files = [
  "fio-plugin-settings-page.tsx",
  "fio-token-form.tsx",
  "fio-token-list.tsx",
]

it("keeps the FIO token out of storage, logs and query keys", () => {
  for (const file of files) {
    expect(read(file), file).not.toMatch(
      /localStorage|AsyncStorage|SecureStore|MMKV|console\.|queryKey|toast\.[a-z]+\(\s*token/iu
    )
  }
})

it("takes the token with secure text entry, validated through parseFioToken, and clears it once stored", () => {
  const form = read("fio-token-form.tsx")
  expect(form).toMatch(/secureTextEntry=\{!revealed\}/)
  const submit = form.slice(form.indexOf("const submit = async"))
  const order = [
    /parseFioToken\(token\)/,
    /await runToast\(/,
    /addFioPluginToken\(/,
    /if \(!saved\) return\s+setToken\(""\)/,
  ]
  let at = 0
  for (const pattern of order) {
    const match = submit.slice(at).match(pattern)
    expect(match, `missing ${pattern}`).not.toBeNull()
    at += (match?.index ?? 0) + (match?.[0].length ?? 0)
  }
})

it("shows saved tokens only masked", () => {
  const list = read("fio-token-list.tsx")
  expect(list).toMatch(/maskFioToken\(token\.token\)/)
  expect(list.match(/token\.token/g)).toHaveLength(1)
})

it("clears token and setting drafts when the active account changes", () => {
  const page = read("fio-plugin-settings-page.tsx")
  expect(page).toMatch(/const \{ accountId \} = useAccess\(\)/)
  expect(page).toMatch(/<FioPluginSettings key=\{accountId\} \/>/)
})
