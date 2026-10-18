import { readFileSync } from "node:fs"
import { expect, it } from "vitest"
import { requiredPermission } from "../../../core/route-access.ts"

const read = (name: string) =>
  readFileSync(new URL(`./${name}`, import.meta.url), "utf8")

it("keeps the security screen owner-only", () => {
  expect(requiredPermission("/settings/security")).toBe("admin")
})

it("changes transports only through the core device-account writes, then reloads", () => {
  for (const name of ["transport-list.tsx", "transport-add-form.tsx"]) {
    const source = read(name)
    expect(source).not.toMatch(/deviceEvolu\.(upsert|update|insert)/u)
    expect(source).toMatch(/runMutationWithCompletion/)
    expect(source).toMatch(/reloadAppEvolu\(\)/)
  }
  expect(read("transport-list.tsx")).toMatch(/setAccountEvoluTransportActive\(/)
  const add = read("transport-add-form.tsx")
  expect(add).toMatch(/WssUrlSchema\.safeParse\(url\.trim\(\)\)/)
  expect(add.indexOf("WssUrlSchema.safeParse")).toBeLessThan(
    add.indexOf("upsertAccountEvoluWebsocketTransport(")
  )
})

it("shows the recovery phrase only on request, behind the owner permission, never stored or copied", () => {
  const card = read("recovery-phrase-card.tsx")
  expect(card).toMatch(
    /await require\("admin", "access\.action\.revealRecoveryPhrase"\)/
  )
  expect(card).toMatch(/endsSessionOnAppState\(state\)\) setRevealed\(false\)/)
  expect(card).toMatch(/gcTime: 0/)
  expect(card).toMatch(/userSelect="none"/)
  expect(card).not.toMatch(
    /console\.|Clipboard|localStorage|AsyncStorage|SecureStore|MMKV/u
  )
})
