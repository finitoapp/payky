import { readFileSync } from "node:fs"
import { expect, it } from "vitest"

const read = (file: string) =>
  readFileSync(new URL(file, import.meta.url), "utf8")
const js = read("./switchio.ts")
const root =
  "../../modules/payky-switchio/android/src/main/java/me/payky/switchio/"
const module = read(`${root}PaykySwitchioModule.kt`)
const store = read(`${root}SwitchioResultStore.kt`)
const plugin = read("../../plugins/with-switchio-result-capture.cjs")

it("names the module and its functions the same in JS and Kotlin", () => {
  expect(js).toContain('"PaykySwitchio"')
  expect(module).toContain('Name("PaykySwitchio")')
  for (const fn of ["isInstalled", "peekStoredResult", "acknowledgeResult"])
    expect(module).toContain(`Function("${fn}")`)
  expect(module).toContain('AsyncFunction("pay")')
})

it("uses the same not-installed rejection code on both sides", () => {
  const code = /SWITCHIO_NOT_INSTALLED_CODE = "([^"]+)"/u.exec(js)?.[1]
  expect(code).toBeDefined()
  expect(module).toContain(`NOT_INSTALLED_CODE = "${code}"`)
})

it("stores the attempt before the terminal is launched", () => {
  const begin = module.indexOf("SwitchioResultStore.begin(")
  const launch = module.indexOf("startActivityForResult(")
  expect(begin).toBeGreaterThan(-1)
  expect(launch).toBeGreaterThan(begin)
})

it("captures the result in MainActivity with the module's request code and passes it on", () => {
  expect(store).toContain("REQUEST_CODE = 53701")
  expect(plugin).toContain("SwitchioResultStore.REQUEST_CODE")
  expect(plugin).toContain(
    "super.onActivityResult(requestCode, resultCode, data)"
  )
})

it("only JS clears a stored result", () => {
  expect(module).not.toMatch(/OnActivityResult[\s\S]*acknowledge/u)
})
