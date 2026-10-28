import { readFileSync } from "node:fs"
import { expect, it } from "vitest"
import { requiredPermission } from "../../../core/route-access.ts"

const page = readFileSync(
  new URL("./cashu-mints-page.tsx", import.meta.url),
  "utf8"
)
const newPage = readFileSync(
  new URL("./cashu-mint-new-page.tsx", import.meta.url),
  "utf8"
)
const detailPage = readFileSync(
  new URL("./cashu-mint-detail-page.tsx", import.meta.url),
  "utf8"
)
const walletHook = readFileSync(
  new URL("../../shared/cashu/use-cashu-wallet.ts", import.meta.url),
  "utf8"
)

it("trusts a mint from its detail through core's Task, owner-gated", () => {
  const trust = detailPage.slice(
    detailPage.indexOf("const trust = "),
    detailPage.indexOf("const setAsDefault = ")
  )
  const gate = trust.indexOf('require("admin", "access.action.cashuMints")')
  const task = trust.indexOf("run(trustCashuMint(mint))")
  expect(gate).toBeGreaterThan(-1)
  expect(task).toBeGreaterThan(gate)
  expect(trust).toContain("cashuMintAddErrorKeys[trusted.error.type]")
})

it("keeps the native mints list owner-only and read-only", () => {
  expect(requiredPermission("/settings/payment-accounts/cashu/mints")).toBe(
    "admin"
  )
  expect(page).toContain("useCashuWallet()")
  expect(walletHook).toContain("useEvoluQuery(cashuTrustedMintsQuery)")
  expect(page).not.toMatch(
    /trustCashuMint|untrustCashuMint|setDefaultCashuMint|loadCashuWallet/u
  )
  expect(page).toContain("/settings/payment-accounts/cashu/mints/new")
})

it("trusts a mint only through core's validating Task, owner-gated", () => {
  expect(requiredPermission("/settings/payment-accounts/cashu/mints/new")).toBe(
    "admin"
  )
  expect(newPage).toContain("run(trustCashuMint(url))")
  expect(newPage).toContain('require("admin", "access.action.cashuMints")')
  expect(newPage).toContain("cashuMintAddErrorKeys[result.error.type]")
  // No network or table access of its own: URL and keyset-host checks live in core.
  expect(newPage).not.toMatch(
    /fetch\(|loadCashuWallet|new Wallet|new Mint|evolu\./u
  )
})

it("untrusts a mint only through core's Task, after the owner gate and a confirmation", () => {
  expect(
    requiredPermission(
      "/settings/payment-accounts/cashu/mints/https%3A%2F%2Fx.y"
    )
  ).toBe("admin")
  const untrust = detailPage.slice(detailPage.indexOf("const untrust = "))
  const gate = untrust.indexOf('require("admin", "access.action.cashuMints")')
  const ask = untrust.indexOf("await confirm({")
  const task = untrust.indexOf("run(untrustCashuMint(mint))")
  expect(gate).toBeGreaterThan(-1)
  expect(ask).toBeGreaterThan(gate)
  expect(task).toBeGreaterThan(ask)
  // The refusal core returns is shown, not swallowed, and the confirmation
  // names the mint that becomes the default.
  expect(detailPage).toContain('"settings.cashuMints.untrustError.last"')
  expect(untrust).toContain(
    "settings.cashuMints.untrustConfirm.defaultDescription"
  )
  expect(detailPage).not.toMatch(
    /evolu\.|loadProofs|loadCashuWallet|new Wallet|new Mint/u
  )
})

it("sets the default mint only through core's Task, after the owner gate", () => {
  const setAsDefault = detailPage.slice(
    detailPage.indexOf("const setAsDefault = "),
    detailPage.indexOf("const untrust = ")
  )
  const gate = setAsDefault.indexOf(
    'require("admin", "access.action.cashuMints")'
  )
  const write = setAsDefault.indexOf("setDefaultCashuMint(mint)")
  expect(gate).toBeGreaterThan(-1)
  expect(write).toBeGreaterThan(gate)
})
