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
const knownMints = readFileSync(
  new URL("../../shared/cashu/use-cashu-known-mints.ts", import.meta.url),
  "utf8"
)
const subscription = readFileSync(
  new URL(
    "../../shared/cashu/cashu-wallet-snapshot-subscription.ts",
    import.meta.url
  ),
  "utf8"
)

it("keeps the native mints list owner-only and read-only", () => {
  expect(requiredPermission("/settings/payment-accounts/cashu/mints")).toBe(
    "admin"
  )
  expect(page).toContain("useCashuKnownMints()")
  expect(page).toContain("!snapshot.hydrated")
  expect(page).toContain("snapshot.hydrated ?")
  expect(page).not.toMatch(
    /addKnownCashuMint|removeKnownCashuMint|writeCashuDefaultMint|loadCashuWallet/u
  )
  expect(page).toContain("/settings/payment-accounts/cashu/mints/new")
})

it("adds a mint only through core's validating Task, owner-gated", () => {
  expect(requiredPermission("/settings/payment-accounts/cashu/mints/new")).toBe(
    "admin"
  )
  expect(newPage).toContain("run(addKnownCashuMint(url))")
  expect(newPage).toContain('require("admin", "access.action.cashuMints")')
  expect(newPage).toContain("cashuMintAddErrorKeys[result.error.type]")
  // No network or table access of its own: URL and keyset-host checks live in core.
  expect(newPage).not.toMatch(
    /fetch\(|loadCashuWallet|new Wallet|new Mint|cashuShardStore|addCashuMint|deviceEvolu/u
  )
})

it("scopes known mints to both the Linky and device account", () => {
  expect(knownMints).toContain(
    '"cashuKnownMints", store.linkyAppOwner.id, account.id'
  )
  expect(knownMints).toContain("loadKnownCashuMints")
  expect(knownMints).toContain("cashuDeviceKnownMintsQuery(account.id)")
  expect(knownMints).toContain("subscribeToCashuWalletSnapshot")
  expect(subscription).toContain("stopAdditional?.()")
})
